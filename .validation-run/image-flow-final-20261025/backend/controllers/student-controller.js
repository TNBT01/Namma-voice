/**
 * NAMMA VOICE - Student Profile Controller
 */

import { get, run } from '../database/database.js';
import { isValidPhone } from '../middleware/validation.js';

export function getStudentProfile(req, res, next) {
  try {
    const studentId = req.session.user.id;
    const student = get(
      'SELECT id, student_id, name, email, phone, department, semester, created_at, updated_at FROM students WHERE id = ?',
      [studentId]
    );

    if (!student) {
      return res.status(404).json({ success: false, error: 'Student profile not found.' });
    }

    res.json({
      success: true,
      profile: student
    });
  } catch (err) {
    next(err);
  }
}

export function updateStudentProfile(req, res, next) {
  try {
    const studentId = req.session.user.id;
    const { name, phone, semester } = req.body;

    if (!name || name.trim().length < 2) {
      return res.status(400).json({ success: false, error: 'Name must have at least 2 characters.' });
    }

    if (phone && !isValidPhone(phone)) {
      return res.status(400).json({ success: false, error: 'Please provide a valid phone number.' });
    }

    const now = new Date().toISOString();
    run(
      'UPDATE students SET name = ?, phone = ?, semester = ?, updated_at = ? WHERE id = ?',
      [name.trim(), phone ? phone.trim() : null, semester ? semester.trim() : '', now, studentId]
    );

    // Update session user cache
    req.session.user.name = name.trim();
    req.session.user.phone = phone ? phone.trim() : null;
    if (semester) req.session.user.semester = semester.trim();

    const updated = get(
      'SELECT id, student_id, name, email, phone, department, semester, created_at, updated_at FROM students WHERE id = ?',
      [studentId]
    );

    res.json({
      success: true,
      message: 'Profile updated successfully.',
      profile: updated
    });
  } catch (err) {
    next(err);
  }
}

export default {
  getStudentProfile,
  updateStudentProfile
};
