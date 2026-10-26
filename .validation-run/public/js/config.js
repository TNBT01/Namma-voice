/**
 * NAMMA VOICE - Frontend Configuration & Branding Constants
 * APS College of Arts and Science
 */

const APP_CONFIG = {
  websiteName: 'NAMMA VOICE',
  primarySlogan: 'Namma College. Namma Voice.',
  supportingTagline: 'A student-focused platform for the APS community.',
  collegeName: 'APS College of Arts and Science',
  
  // Project Credits and Acknowledgements
  credits: {
    departmentHead: 'Dr. Satyashree — Head of the Computer Science Department',
    faculty: 'Associate Professor Manjunath — BCA / Computer Science faculty',
    developer: 'Sathya Prakash — Developer / Project Contributor',
    contributor: 'Kausar Bee S — Project Contributor'
  },

  // Courses Offered (Strictly BCA, B.Sc, B.A)
  courses: [
    { code: 'BCA', name: 'Bachelor of Computer Applications', duration: '3 Years (6 Semesters)', description: 'Full-stack software development, database architecture, network systems, web technologies, and computing practicals.' },
    { code: 'B.Sc', name: 'Bachelor of Science', duration: '3 Years (6 Semesters)', description: 'Interdisciplinary science combining physics, chemistry, mathematics, and computing with laboratory research.' },
    { code: 'B.A', name: 'Bachelor of Arts', duration: '3 Years (6 Semesters)', description: 'Humanities, history, literature, economics, journalism, and political philosophy.' }
  ],

  academicDepartments: ['BCA', 'B.Sc', 'B.A'],
  semesters: ['Semester 1', 'Semester 2', 'Semester 3', 'Semester 4', 'Semester 5', 'Semester 6'],

  // Complaint Categories
  categories: [
    'Classroom',
    'Laboratory',
    'Library',
    'Hostel',
    'Canteen',
    'Infrastructure',
    'Washroom',
    'Sports',
    'Electrical',
    'Other'
  ],

  // Administrative Departments
  departments: [
    'Administration',
    'Maintenance',
    'IT Department',
    'Library',
    'Hostel Management',
    'Canteen',
    'Sports Department',
    'Laboratory',
    'Other'
  ],

  // Status Labels & Badges
  statuses: ['Pending', 'In Progress', 'Resolved']
};

window.APP_CONFIG = APP_CONFIG;
