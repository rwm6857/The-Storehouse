function requireAdmin(req, res, next) {
  if (req.session && req.session.isAdmin) {
    return next();
  }
  const returnTo = encodeURIComponent(req.originalUrl || '/admin');
  return res.redirect(`/admin/login?returnTo=${returnTo}`);
}

module.exports = requireAdmin;
