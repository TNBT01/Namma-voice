/**
 * NAMMA VOICE - Centralized Error Handler Middleware
 */

export function errorHandler(err, req, res, next) {
  console.error('Request failed:', req.method, req.path, err.name || 'Error');

  // Multer specific errors
  if (err.name === 'MulterError') {
    if (err.code === 'LIMIT_FILE_SIZE') {
      return res.status(400).json({
        success: false,
        error: 'Uploaded file exceeds the maximum allowed file size limit.'
      });
    }
    return res.status(400).json({ success: false, error: 'The file could not be uploaded. Please check the file and try again.' });
  }

  // Custom filter errors
  if (err.message && (err.message.includes('Invalid file format') || err.message.includes('Invalid resource format'))) {
    return res.status(400).json({
      success: false,
      error: err.message
    });
  }

  const statusCode = err.statusCode || 500;
  const message = err.statusCode && statusCode < 500
    ? err.message
    : 'An internal server error occurred. Please try again.';

  res.status(statusCode).json({
    success: false,
    error: message
  });
}

export default errorHandler;
