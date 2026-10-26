/**
 * NAMMA VOICE - Administrator Controller
 * Handles Admin Dashboard Analytics, Complaint Management, Department Assignment, Status Progression.
 */

import { get, query, run, transaction } from '../database/database.js';
import { config } from '../config/config.js';

export function getAdminDashboard(req, res, next) {
  try {
    const today = new Date().toISOString().slice(0, 10);

    // Totals
    const total = get('SELECT COUNT(*) as c FROM complaints').c;
    const pending = get('SELECT COUNT(*) as c FROM complaints WHERE status = "Pending"').c;
    const inProgress = get('SELECT COUNT(*) as c FROM complaints WHERE status = "In Progress"').c;
    const resolved = get('SELECT COUNT(*) as c FROM complaints WHERE status = "Resolved"').c;
    const todayCount = get('SELECT COUNT(*) as c FROM complaints WHERE created_at LIKE ?', [`${today}%`]).c;

    // Complaints by Category
    const categoryRows = query(`
      SELECT category, COUNT(*) as count 
      FROM complaints 
      GROUP BY category 
      ORDER BY count DESC
    `);

    // Ensure all defined categories have representation or provide non-zero
    const categoryStats = config.categories.map(cat => {
      const found = categoryRows.find(r => r.category === cat);
      return {
        category: cat,
        count: found ? found.count : 0
      };
    });

    // Complaints by Status
    const statusStats = [
      { status: 'Pending', count: pending, color: '#f59e0b' },
      { status: 'In Progress', count: inProgress, color: '#2563eb' },
      { status: 'Resolved', count: resolved, color: '#16a34a' }
    ];

    // Monthly trends (Last 6 months)
    const monthlyStats = [];
    const date = new Date();
    for (let i = 5; i >= 0; i--) {
      const d = new Date(date.getFullYear(), date.getMonth() - i, 1);
      const monthStr = d.toISOString().slice(0, 7); // YYYY-MM
      const monthLabel = d.toLocaleString('default', { month: 'short', year: '2-digit' });
      const count = get('SELECT COUNT(*) as c FROM complaints WHERE created_at LIKE ?', [`${monthStr}%`]).c;
      monthlyStats.push({
        month: monthLabel,
        count
      });
    }

    // Recent 5 complaints
    const recentComplaints = query(`
      SELECT c.*, s.name as student_name, s.department as student_department
      FROM complaints c
      JOIN students s ON c.student_id = s.id
      ORDER BY c.created_at DESC
      LIMIT 5
    `);

    // Academic Resources Stats
    const totalResources = get('SELECT COUNT(*) as c FROM resources').c;
    const resourcesByCourse = query(`
      SELECT department as course, COUNT(*) as count
      FROM resources
      GROUP BY department
      ORDER BY count DESC
    `);
    const recentResources = query(`
      SELECT resource_id, title, department, subject, semester, academic_year, original_filename, created_at
      FROM resources
      ORDER BY created_at DESC
      LIMIT 5
    `);

    res.json({
      success: true,
      stats: {
        total,
        pending,
        inProgress,
        resolved,
        today: todayCount,
        totalResources
      },
      resourcesByCourse,
      recentResources,
      charts: {
        byCategory: categoryStats,
        byStatus: statusStats,
        monthlyTrends: monthlyStats
      },
      recentComplaints
    });
  } catch (err) {
    next(err);
  }
}

export function getAllComplaints(req, res, next) {
  try {
    const { status, category, department, search } = req.query;

    let sql = `
      SELECT c.*, s.name as student_name, s.email as student_email, s.department as student_department, s.phone as student_phone, s.student_id as student_reg_id
      FROM complaints c
      JOIN students s ON c.student_id = s.id
      WHERE 1=1
    `;
    const params = [];

    if (status && status.trim()) {
      sql += ' AND c.status = ?';
      params.push(status.trim());
    }

    if (category && category.trim()) {
      sql += ' AND c.category = ?';
      params.push(category.trim());
    }

    if (department && department.trim()) {
      sql += ' AND c.assigned_department = ?';
      params.push(department.trim());
    }

    if (search && search.trim()) {
      sql += ' AND (c.complaint_id LIKE ? OR c.title LIKE ? OR s.name LIKE ? OR c.location LIKE ?)';
      const term = `%${search.trim()}%`;
      params.push(term, term, term, term);
    }

    sql += ' ORDER BY c.created_at DESC';

    const complaints = query(sql, params);

    res.json({
      success: true,
      complaints
    });
  } catch (err) {
    next(err);
  }
}

export function updateComplaint(req, res, next) {
  try {
    const complaintIdParam = req.params.id;
    const { status, assigned_department, admin_remarks } = req.body;
    const adminUser = req.session.user;

    let complaint = null;
    if (isNaN(Number(complaintIdParam))) {
      complaint = get('SELECT * FROM complaints WHERE complaint_id = ?', [complaintIdParam]);
    } else {
      complaint = get('SELECT * FROM complaints WHERE id = ?', [Number(complaintIdParam)]);
    }

    if (!complaint) {
      return res.status(404).json({ success: false, error: 'Complaint not found.' });
    }

    const currentStatus = complaint.status;
    const targetStatus = status || currentStatus;
    const targetDept = assigned_department !== undefined ? assigned_department : complaint.assigned_department;
    const remarks = admin_remarks !== undefined ? admin_remarks : complaint.admin_remarks;
    const now = new Date().toISOString();

    transaction(() => {
      // Update complaint
      run(
        `UPDATE complaints 
         SET status = ?, assigned_department = ?, admin_remarks = ?, updated_at = ?
         WHERE id = ?`,
        [targetStatus, targetDept, remarks, now, complaint.id]
      );

      // If status changed or remarks provided, add to history
      if (targetStatus !== currentStatus || (remarks && remarks !== complaint.admin_remarks)) {
        const historyRemarks = remarks || `Status updated to ${targetStatus}`;
        run(
          `INSERT INTO complaint_history (complaint_id, old_status, new_status, remarks, updated_by, updated_at)
           VALUES (?, ?, ?, ?, ?, ?)`,
          [
            complaint.id,
            currentStatus,
            targetStatus,
            historyRemarks,
            `${adminUser.name} (Admin)`,
            now
          ]
        );
      }
    });

    const updated = get(`
      SELECT c.*, s.name as student_name, s.email as student_email, s.department as student_department, s.phone as student_phone, s.student_id as student_reg_id
      FROM complaints c
      JOIN students s ON c.student_id = s.id
      WHERE c.id = ?
    `, [complaint.id]);

    const history = query('SELECT * FROM complaint_history WHERE complaint_id = ? ORDER BY id ASC', [complaint.id]);

    res.json({
      success: true,
      message: 'Complaint updated successfully.',
      complaint: {
        ...updated,
        history
      }
    });
  } catch (err) {
    next(err);
  }
}

export function getAdminProfile(req, res, next) {
  try {
    const adminId = req.session.user.id;
    const admin = get('SELECT id, name, email, department, role, created_at FROM admins WHERE id = ?', [adminId]);
    if (!admin) {
      return res.status(404).json({ success: false, error: 'Admin profile not found.' });
    }
    res.json({
      success: true,
      profile: admin
    });
  } catch (err) {
    next(err);
  }
}

export function updateAdminProfile(req, res, next) {
  try {
    const adminId = req.session.user.id;
    const { name, department } = req.body;

    if (!name || name.trim().length < 2) {
      return res.status(400).json({ success: false, error: 'Name must have at least 2 characters.' });
    }

    const now = new Date().toISOString();
    run(
      'UPDATE admins SET name = ?, department = ?, updated_at = ? WHERE id = ?',
      [name.trim(), department ? department.trim() : 'Administration', now, adminId]
    );

    req.session.user.name = name.trim();
    if (department) req.session.user.department = department.trim();

    const updated = get('SELECT id, name, email, department, role, created_at FROM admins WHERE id = ?', [adminId]);

    res.json({
      success: true,
      message: 'Admin profile updated successfully.',
      profile: updated
    });
  } catch (err) {
    next(err);
  }
}

export function getDatabaseOverview(req, res, next) {
  try {
    const students = query('SELECT id, student_id, name, email, department, semester, created_at FROM students');
    const admins = query('SELECT id, name, email, department, role, created_at FROM admins');
    const complaints = query('SELECT id, complaint_id, student_id, title, category, location, assigned_department, status, admin_remarks, created_at, updated_at FROM complaints');
    const history = query('SELECT id, complaint_id, old_status, new_status, remarks, updated_by, updated_at FROM complaint_history');
    const resources = query('SELECT id, resource_id, title, department, subject, semester, academic_year, original_filename, uploaded_by, created_at FROM resources');

    res.json({
      success: true,
      databaseFile: 'database/namma_voice.sqlite',
      tables: {
        students,
        admins,
        complaints,
        complaint_history: history,
        resources
      }
    });
  } catch (err) {
    next(err);
  }
}

export function getRegisteredStudents(req, res, next) {
  try {
    const search = (req.query.search || '').trim().toLowerCase();
    let sql = `
      SELECT id, student_id, name, email, phone, department, semester, is_active, created_at, updated_at
      FROM students
    `;
    const params = [];

    if (search) {
      sql += `
        WHERE LOWER(name) LIKE ? OR LOWER(student_id) LIKE ? OR LOWER(email) LIKE ? OR LOWER(department) LIKE ?
      `;
      const pattern = `%${search}%`;
      params.push(pattern, pattern, pattern, pattern);
    }

    sql += ' ORDER BY id DESC';

    const students = query(sql, params);
    res.json({
      success: true,
      students
    });
  } catch (err) {
    next(err);
  }
}

export function toggleStudentStatus(req, res, next) {
  try {
    const studentId = parseInt(req.params.id, 10);
    const { is_active } = req.body;

    const student = get('SELECT id, student_id, name, email, is_active FROM students WHERE id = ?', [studentId]);
    if (!student) {
      return res.status(404).json({ success: false, error: 'Student account not found.' });
    }

    const newStatus = is_active === 0 || is_active === false ? 0 : 1;
    const now = new Date().toISOString();

    run('UPDATE students SET is_active = ?, updated_at = ? WHERE id = ?', [newStatus, now, studentId]);

    // Record audit log
    const admin = req.session.user;
    run(
      `INSERT INTO audit_logs (admin_id, admin_name, action, target_type, target_id, details, created_at)
       VALUES (?, ?, ?, 'student', ?, ?, ?)`,
      [
        admin.id,
        admin.name,
        newStatus === 1 ? 'ACTIVATE_STUDENT' : 'DEACTIVATE_STUDENT',
        student.student_id,
        `Changed status of student ${student.name} (${student.email}) to ${newStatus === 1 ? 'Active' : 'Deactivated'}`,
        now
      ]
    );

    res.json({
      success: true,
      message: `Student account ${newStatus === 1 ? 'activated' : 'deactivated'} successfully.`,
      student: { ...student, is_active: newStatus }
    });
  } catch (err) {
    next(err);
  }
}

export function getAuditLogs(req, res, next) {
  try {
    const logs = query('SELECT * FROM audit_logs ORDER BY id DESC LIMIT 100');
    res.json({
      success: true,
      logs
    });
  } catch (err) {
    next(err);
  }
}

export default {
  getAdminDashboard,
  getAllComplaints,
  updateComplaint,
  getAdminProfile,
  updateAdminProfile,
  getDatabaseOverview,
  getRegisteredStudents,
  toggleStudentStatus,
  getAuditLogs
};

