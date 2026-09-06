const jwt = require('jsonwebtoken');
const { getUser } = require('../db');

function requireAuth(req, res, next) {
  const token = req.cookies && req.cookies.kazan_token;
  if (!token) return res.status(401).json({ error: 'Giriş gerekli' });
  try {
    const payload = jwt.verify(token, process.env.JWT_SECRET);
    const user = getUser(payload.email);
    if (!user) return res.status(401).json({ error: 'Kullanıcı bulunamadı' });
    req.userEmail = payload.email;
    req.user = user;
    next();
  } catch (e) {
    return res.status(401).json({ error: 'Oturum geçersiz veya süresi dolmuş' });
  }
}

module.exports = { requireAuth };
