/**
 * NAMMA VOICE - Complaint Controller
 * Handles Student Complaint Submission, Listing, Details, and Statistics.
 */

import path from 'path';
import { get, query, run, transaction } from '../database/database.js';
import { config } from '../config/config.js';

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
      complaint: createdComplaint
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

    const complaints = query(sql, params);

    // Compute dynamic dashboard stats for this student
    const total = get('SELECT COUNT(*) as c FROM complaints WHERE student_id = ?', [studentId]).c;
    const pending = get('SELECT COUNT(*) as c FROM complaints WHERE student_id = ? AND status = "Pending"', [studentId]).c;
    const inProgress = get('SELECT COUNT(*) as c FROM complaints WHERE student_id = ? AND status = "In Progress"', [studentId]).c;
    const resolved = get('SELECT COUNT(*) as c FROM complaints WHERE student_id = ? AND status = "Resolved"', [studentId]).c;

    res.json({
      success: true,
      stats: {
        total,
        pending,
        inProgress,
        resolved
      },
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
      complaint = get('SELECT c.*, s.name as student_name, s.email as student_email, s.department as student_department, s.phone as student_phone, s.student_id as student_reg_id FROM complaints c JOIN students s ON c.student_id = s.id WHERE c.complaint_id = ?', [complaintIdentifier]);
    } else {
      complaint = get('SELECT c.*, s.name as student_name, s.email as student_email, s.department as student_department, s.phone as student_phone, s.student_id as student_reg_id FROM complaints c JOIN students s ON c.student_id = s.id WHERE c.id = ?', [Number(complaintIdentifier)]);
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
      'SELECT * FROM complaint_history WHERE complaint_id = ? ORDER BY id ASC',
      [complaint.id]
    );

    res.json({
      success: true,
      complaint: {
        ...complaint,
        history
      }
    });
  } catch (err) {
    next(err);
  }
}

export default {
  createComplaint,
  getMyComplaints,
  getComplaintById
};
