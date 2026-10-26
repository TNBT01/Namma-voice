/**
 * NAMMA VOICE - Complaint Controller
 * Handles Student Complaint Submission, Listing, Details, and Statistics.
 */

import path from 'path';
import fs from 'fs';
import { get, query, run, transaction } from '../database/database.js';
import { config } from '../config/config.js';

function serializeComplaint(row) {
  if (!row) return row;
  const { student_id, attachment_path, ...complaint } = row;
  return { ...complaint, has_attachment: Boolean(attachment_path) };
}

export function createComplaint(req, res, next) {
  try {
    const studentId = req.session.user.id;
    const { title, description, category, location } = req.body;

    // Optional attachment path
    let attachmentPath = null;
    if (req.file) {
      attachmentPath = `/uploads/complaints/${req.file.filename}`;
    }

    const currentYear = new Date().getFullYear();
    const now = new Date().toISOString();

    let createdComplaint = null;

    transaction(() => {
      // Find count of complaints for this year to generate NV-YYYY-XXX
      const yearPrefix = `NV-${currentYear}-%`;
      const countRow = get('SELECT COUNT(*) as count FROM complaints WHERE complaint_id LIKE ?', [yearPrefix]);
      const nextSeq = (countRow ? countRow.count : 0) + 1;
      const complaintId = `NV-${currentYear}-${String(nextSeq).padStart(3, '0')}`;

      // Insert complaint
      const insertRes = run(
        `INSERT INTO complaints (complaint_id, student_id, title, description, category, location, attachment_path, assigned_department, status, admin_remarks, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          complaintId,
          studentId,
          title.trim(),
          description.trim(),
          category.trim(),
          location.trim(),
          attachmentPath,
          null,
          'Pending',
          null,
          now,
          now
        ]
      );

      const internalId = insertRes.lastInsertRowid;

      // Insert initial history record
      run(
        `INSERT INTO complaint_history (complaint_id, old_status, new_status, remarks, updated_by, updated_at)
         VALUES (?, ?, ?, ?, ?, ?)`,
        [
          internalId,
          null,
          'Pending',
          'Complaint registered by student',
          'Student',
          now
        ]
      );

      createdComplaint = get('SELECT * FROM complaints WHERE id = ?', [internalId]);
    });

    res.status(201).json({
      success: true,
      message: 'Complaint submitted successfully! Your complaint has been registered.',
      complaint: serializeComplaint(createdComplaint)
    });
  } catch (err) {
    next(err);
  }
}

export function getMyComplaints(req, res, next) {
  try {
    const studentId = req.session.user.id;
    const { category, status, search } = req.query;

    let sql = 'SELECT * FROM complaints WHERE student_id = ?';
    const params = [studentId];

    if (category && category.trim()) {
      sql += ' AND category = ?';
      params.push(category.trim());
    }

    if (status && status.trim()) {
      sql += ' AND status = ?';
      params.push(status.trim());
    }

    if (search && search.trim()) {
      sql += ' AND (complaint_id LIKE ? OR title LIKE ? OR description LIKE ?)';
      const term = `%${search.trim()}%`;
      params.push(term, term, term);
    }

    sql += ' ORDER BY created_at DESC';

    const complaints = query(sql, params).map(serializeComplaint);

    // Compute dynamic dashboard stats for this student
    const stats = get(`
      SELECT COUNT(*) AS total,
        COALESCE(SUM(CASE WHEN status = 'Pending' THEN 1 ELSE 0 END), 0) AS pending,
        COALESCE(SUM(CASE WHEN status = 'In Progress' THEN 1 ELSE 0 END), 0) AS inProgress,
        COALESCE(SUM(CASE WHEN status = 'Resolved' THEN 1 ELSE 0 END), 0) AS resolved
      FROM complaints WHERE student_id = ?
    `, [studentId]);

    res.json({
      success: true,
      stats,
      complaints
    });
  } catch (err) {
    next(err);
  }
}

export function getComplaintById(req, res, next) {
  try {
    const complaintIdentifier = req.params.id; // Could be numeric ID or NV-2026-001 format
    const user = req.session.user;

    let complaint = null;
    if (isNaN(Number(complaintIdentifier))) {
      complaint = get('SELECT * FROM complaints WHERE complaint_id = ?', [complaintIdentifier]);
    } else {
      complaint = get('SELECT * FROM complaints WHERE id = ?', [Number(complaintIdentifier)]);
    }

    if (!complaint) {
      return res.status(404).json({ success: false, error: 'Complaint not found.' });
    }

    // Role-based authorization check:
    // If student, must be owner
    if (user.role === 'student' && complaint.student_id !== user.id) {
      return res.status(403).json({ success: false, error: 'Unauthorized. You can only view your own complaints.' });
    }

    // Fetch status history timeline
    const history = query(
      'SELECT old_status, new_status, remarks, updated_by, updated_at FROM complaint_history WHERE complaint_id = ? ORDER BY id ASC',
      [complaint.id]
    );

    res.json({
      success: true,
      complaint: {
        ...serializeComplaint(complaint),
        history
      }
    });
  } catch (err) {
    next(err);
  }
}

export function getAdminComplaintById(req, res, next) {
  try {
    const identifier = req.params.id;
    const complaint = isNaN(Number(identifier))
      ? get(`SELECT id, complaint_id, title, description, category, location, attachment_path,
                    assigned_department, status, admin_remarks, created_at, updated_at
             FROM complaints WHERE complaint_id = ?`, [identifier])
      : get(`SELECT id, complaint_id, title, description, category, location, attachment_path,
                    assigned_department, status, admin_remarks, created_at, updated_at
             FROM complaints WHERE id = ?`, [Number(identifier)]);

    if (!complaint) return res.status(404).json({ success: false, error: 'Complaint not found.' });

    const history = query(`
      SELECT old_status, new_status, remarks, updated_by, updated_at
      FROM complaint_history WHERE complaint_id = ? ORDER BY id ASC
    `, [complaint.id]);
    const { id, attachment_path, ...fields } = complaint;

    res.json({
      success: true,
      complaint: { ...fields, has_attachment: Boolean(attachment_path), history }
    });
  } catch (err) {
    next(err);
  }
}

export function getComplaintAttachment(req, res, next) {
  try {
    const identifier = req.params.id;
    const complaint = isNaN(Number(identifier))
      ? get('SELECT student_id, attachment_path FROM complaints WHERE complaint_id = ?', [identifier])
      : get('SELECT student_id, attachment_path FROM complaints WHERE id = ?', [Number(identifier)]);

    if (!complaint || !complaint.attachment_path) {
      return res.status(404).json({ success: false, error: 'Attachment not found.' });
    }
    if (req.session.user.role === 'student' && complaint.student_id !== req.session.user.id) {
      return res.status(403).json({ success: false, error: 'You cannot access this attachment.' });
    }

    const uploadRoot = path.resolve(config.paths.complaintUploads);
    const filename = path.basename(complaint.attachment_path);
    const filePath = path.resolve(uploadRoot, filename);
    if (!filePath.startsWith(`${uploadRoot}${path.sep}`) || !fs.existsSync(filePath)) {
      return res.status(404).json({ success: false, error: 'Attachment not found.' });
    }

    res.set({
      'Cache-Control': 'private, no-store, max-age=0',
      'X-Robots-Tag': 'noindex, nofollow, noarchive'
    });
    return res.sendFile(filePath, err => {
      if (err && !res.headersSent) next(err);
    });
  } catch (err) {
    next(err);
  }
}

export default {
  createComplaint,
  getMyComplaints,
  getComplaintById,
  getAdminComplaintById,
  getComplaintAttachment
};
