/**
 * NAMMA VOICE - Administrator Controller
 * Handles Admin Dashboard Analytics, Complaint Management, Department Assignment, Status Progression.
 */

import { get, query, run, transaction } from '../database/database.js';
import { config } from '../config/config.js';

export function getAdminDashboard(req, res, next) {
  try {
    const totals = get(`
      SELECT
        COUNT(*) AS total,
        COALESCE(SUM(CASE WHEN status = 'Pending' THEN 1 ELSE 0 END), 0) AS pending,
        COALESCE(SUM(CASE WHEN status = 'In Progress' THEN 1 ELSE 0 END), 0) AS inProgress,
        COALESCE(SUM(CASE WHEN status = 'Resolved' THEN 1 ELSE 0 END), 0) AS resolved
      FROM complaints
    `);

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
      { status: 'Pending', count: totals.pending, color: '#a8772c' },
      { status: 'In Progress', count: totals.inProgress, color: '#365268' },
      { status: 'Resolved', count: totals.resolved, color: '#397052' }
    ];

    // Monthly trends (Last 6 months)
    const date = new Date();
    const firstMonth = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth() - 5, 1));
    const firstMonthKey = firstMonth.toISOString().slice(0, 7);
    const monthlyRows = query(`
      SELECT substr(created_at, 1, 7) AS month_key, COUNT(*) AS count
      FROM complaints
      WHERE created_at >= ?
      GROUP BY month_key
      ORDER BY month_key
    `, [`${firstMonthKey}-01`]);
    const monthlyCounts = new Map(monthlyRows.map(row => [row.month_key, row.count]));
    const monthlyStats = [];
    for (let i = 5; i >= 0; i--) {
      const d = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth() - i, 1));
      const monthStr = d.toISOString().slice(0, 7);
      const monthLabel = d.toLocaleString('en', { month: 'short', year: '2-digit', timeZone: 'UTC' });
      monthlyStats.push({
        month: monthLabel,
        count: monthlyCounts.get(monthStr) || 0
      });
    }

    // Recent 5 complaints. Only management fields are selected; no student FK or account data.
    const recentComplaints = query(`
      SELECT complaint_id, title, category, assigned_department, status, created_at
      FROM complaints
      ORDER BY created_at DESC, complaint_id DESC
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
        total: totals.total,
        pending: totals.pending,
        inProgress: totals.inProgress,
        resolved: totals.resolved,
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
    const status = typeof req.query.status === 'string' ? req.query.status.trim() : '';
    const category = typeof req.query.category === 'string' ? req.query.category.trim() : '';
    const department = typeof req.query.department === 'string' ? req.query.department.trim() : '';
    const search = typeof req.query.search === 'string' ? req.query.search.trim().slice(0, 120) : '';
    const requestedPage = Math.max(1, Number.parseInt(req.query.page, 10) || 1);
    const pageSize = Math.min(50, Math.max(1, Number.parseInt(req.query.pageSize, 10) || 25));
    const sortOrder = req.query.sort === 'oldest' ? 'ASC' : 'DESC';

    let whereSql = ' FROM complaints WHERE 1=1';
    const params = [];

    if (status) {
      whereSql += ' AND status = ?';
      params.push(status);
    }

    if (category) {
      whereSql += ' AND category = ?';
      params.push(category);
    }

    if (department) {
      whereSql += ' AND assigned_department = ?';
      params.push(department);
    }

    if (search) {
      whereSql += ' AND (LOWER(complaint_id) LIKE ? OR LOWER(title) LIKE ?)';
      const term = `%${search.toLowerCase()}%`;
      params.push(term, term);
    }

    const total = get(`SELECT COUNT(*) AS count${whereSql}`, params).count;
    const page = Math.min(requestedPage, Math.max(1, Math.ceil(total / pageSize)));
    const offset = (page - 1) * pageSize;
    const complaints = query(`
      SELECT complaint_id, title, category, assigned_department, status, created_at,
             CASE WHEN attachment_path IS NOT NULL AND attachment_path <> '' THEN 1 ELSE 0 END AS has_attachment
      ${whereSql}
      ORDER BY created_at ${sortOrder}, id ${sortOrder}
      LIMIT ? OFFSET ?
    `, [...params, pageSize, offset]).map(complaint => ({
      ...complaint,
      has_attachment: Boolean(complaint.has_attachment)
    }));

    res.json({
      success: true,
      complaints,
      pagination: {
        page,
        pageSize,
        total,
        totalPages: Math.ceil(total / pageSize),
        hasPrevious: page > 1,
        hasNext: offset + complaints.length < total
      }
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

    const updatedRow = get(`
      SELECT complaint_id, title, description, category, location, assigned_department,
             status, admin_remarks, created_at, updated_at, attachment_path
      FROM complaints WHERE id = ?
    `, [complaint.id]);

    const history = query(`
      SELECT old_status, new_status, remarks, updated_by, updated_at
      FROM complaint_history WHERE complaint_id = ? ORDER BY id ASC
    `, [complaint.id]);
    const { attachment_path, ...updated } = updatedRow;

    res.json({
      success: true,
      message: 'Complaint updated successfully.',
      complaint: {
        ...updated,
        has_attachment: Boolean(attachment_path),
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
    const counts = {
      students: get('SELECT COUNT(*) AS count FROM students').count,
      admins: get('SELECT COUNT(*) AS count FROM admins').count,
      complaints: get('SELECT COUNT(*) AS count FROM complaints').count,
      complaint_history: get('SELECT COUNT(*) AS count FROM complaint_history').count,
      resources: get('SELECT COUNT(*) AS count FROM resources').count,
      audit_logs: get('SELECT COUNT(*) AS count FROM audit_logs').count,
      password_resets: get('SELECT COUNT(*) AS count FROM password_resets').count
    };

    res.json({
      success: true,
      tables: counts
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

