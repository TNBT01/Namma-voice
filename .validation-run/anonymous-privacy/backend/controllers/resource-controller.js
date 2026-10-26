/**
 * NAMMA VOICE - Academic Resources Controller
 * Previous Years' Question Papers Repository & Management
 */

import fs from 'fs';
import path from 'path';
import { get, query, run } from '../database/database.js';
import { config } from '../config/config.js';

export function getResources(req, res, next) {
  try {
    const { department, semester, academic_year, search } = req.query;

    let sql = 'SELECT * FROM resources WHERE 1=1';
    const params = [];

    if (department && department.trim()) {
      sql += ' AND department = ?';
      params.push(department.trim());
    }

    if (semester && semester.trim()) {
      sql += ' AND semester = ?';
      params.push(semester.trim());
    }

    if (academic_year && academic_year.trim()) {
      sql += ' AND academic_year = ?';
      params.push(academic_year.trim());
    }

    if (search && search.trim()) {
      sql += ' AND (title LIKE ? OR subject LIKE ?)';
      const term = `%${search.trim()}%`;
      params.push(term, term);
    }

    sql += ' ORDER BY created_at DESC';

    const resources = query(sql, params);

    res.json({
      success: true,
      resources
    });
  } catch (err) {
    next(err);
  }
}

export function downloadResource(req, res, next) {
  try {
    const resourceIdParam = req.params.id;

    let resource = null;
    if (isNaN(Number(resourceIdParam))) {
      resource = get('SELECT * FROM resources WHERE resource_id = ?', [resourceIdParam]);
    } else {
      resource = get('SELECT * FROM resources WHERE id = ?', [Number(resourceIdParam)]);
    }

    if (!resource) {
      return res.status(404).json({ success: false, error: 'Resource not found in archive.' });
    }

    const filePath = path.join(config.paths.resourceUploads, path.basename(resource.file_path));

    if (!fs.existsSync(filePath)) {
      return res.status(404).json({
        success: false,
        error: 'The requested question paper file is currently unavailable on the server.'
      });
    }

    const ext = path.extname(resource.original_filename).toLowerCase();
    let contentType = 'application/octet-stream';
    if (ext === '.pdf') contentType = 'application/pdf';
    else if (ext === '.docx') contentType = 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';
    else if (ext === '.doc') contentType = 'application/msword';
    else if (ext === '.pptx') contentType = 'application/vnd.openxmlformats-officedocument.presentationml.presentation';
    else if (ext === '.ppt') contentType = 'application/vnd.ms-powerpoint';
    else if (ext === '.txt') contentType = 'text/plain';

    res.setHeader('Content-Type', contentType);
    res.setHeader('Content-Disposition', `attachment; filename="${encodeURIComponent(resource.original_filename)}"`);

    const fileStream = fs.createReadStream(filePath);
    fileStream.pipe(res);
  } catch (err) {
    next(err);
  }
}

export function uploadResource(req, res, next) {
  try {
    const { title, department, subject, semester, academic_year } = req.body;
    const adminUser = req.session.user;

    if (!req.file) {
      return res.status(400).json({ success: false, error: 'Please select a document file to upload.' });
    }

    if (!title || title.trim().length < 3) {
      return res.status(400).json({ success: false, error: 'Resource title is required (minimum 3 characters).' });
    }

    const validCourses = ['BCA', 'B.Sc', 'B.A'];
    if (!department || !validCourses.includes(department.trim())) {
      return res.status(400).json({
        success: false,
        error: 'Invalid course. The college strictly offers: BCA, B.Sc, B.A.'
      });
    }

    if (!subject || !semester || !academic_year) {
      return res.status(400).json({
        success: false,
        error: 'Course, subject, semester, and academic year are all required.'
      });
    }

    const currentYear = new Date().getFullYear();
    const countRow = get('SELECT COUNT(*) as count FROM resources');
    const seq = (countRow ? countRow.count : 0) + 1;
    const resourceId = `RES-${currentYear}-${String(seq).padStart(3, '0')}`;
    const now = new Date().toISOString();

    const insertRes = run(
      `INSERT INTO resources (resource_id, title, department, subject, semester, academic_year, file_path, original_filename, uploaded_by, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        resourceId,
        title.trim(),
        department.trim(),
        subject.trim(),
        semester.trim(),
        academic_year.trim(),
        req.file.filename,
        req.file.originalname,
        `${adminUser.name} (Admin)`,
        now
      ]
    );

    const created = get('SELECT * FROM resources WHERE id = ?', [insertRes.lastInsertRowid]);

    res.status(201).json({
      success: true,
      message: 'Academic resource uploaded successfully to repository.',
      resource: created
    });
  } catch (err) {
    next(err);
  }
}

export function updateResource(req, res, next) {
  try {
    const resourceIdParam = req.params.id;
    const { title, department, subject, semester, academic_year } = req.body;

    let resource = null;
    if (isNaN(Number(resourceIdParam))) {
      resource = get('SELECT * FROM resources WHERE resource_id = ?', [resourceIdParam]);
    } else {
      resource = get('SELECT * FROM resources WHERE id = ?', [Number(resourceIdParam)]);
    }

    if (!resource) {
      return res.status(404).json({ success: false, error: 'Resource not found.' });
    }

    const validCourses = ['BCA', 'B.Sc', 'B.A'];
    if (department && !validCourses.includes(department.trim())) {
      return res.status(400).json({
        success: false,
        error: 'Invalid course. The college strictly offers: BCA, B.Sc, B.A.'
      });
    }

    const updatedTitle = title ? title.trim() : resource.title;
    const updatedDept = department ? department.trim() : resource.department;
    const updatedSubject = subject ? subject.trim() : resource.subject;
    const updatedSem = semester ? semester.trim() : resource.semester;
    const updatedYear = academic_year ? academic_year.trim() : resource.academic_year;

    run(
      `UPDATE resources
       SET title = ?, department = ?, subject = ?, semester = ?, academic_year = ?
       WHERE id = ?`,
      [updatedTitle, updatedDept, updatedSubject, updatedSem, updatedYear, resource.id]
    );

    const updated = get('SELECT * FROM resources WHERE id = ?', [resource.id]);

    res.json({
      success: true,
      message: 'Resource metadata updated successfully.',
      resource: updated
    });
  } catch (err) {
    next(err);
  }
}

export function deleteResource(req, res, next) {
  try {
    const resourceIdParam = req.params.id;

    let resource = null;
    if (isNaN(Number(resourceIdParam))) {
      resource = get('SELECT * FROM resources WHERE resource_id = ?', [resourceIdParam]);
    } else {
      resource = get('SELECT * FROM resources WHERE id = ?', [Number(resourceIdParam)]);
    }

    if (!resource) {
      return res.status(404).json({ success: false, error: 'Resource not found.' });
    }

    const filePath = path.join(config.paths.resourceUploads, path.basename(resource.file_path));
    if (fs.existsSync(filePath)) {
      try {
        fs.unlinkSync(filePath);
      } catch (e) {
        console.warn('Failed to delete physical file:', e);
      }
    }

    run('DELETE FROM resources WHERE id = ?', [resource.id]);

    res.json({
      success: true,
      message: 'Resource removed from repository successfully.'
    });
  } catch (err) {
    next(err);
  }
}

export default {
  getResources,
  downloadResource,
  uploadResource,
  updateResource,
  deleteResource
};
