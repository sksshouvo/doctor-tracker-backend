import bcrypt from 'bcryptjs';
import { ApiError } from '../../lib/ApiError.js';
import { User } from '../users/user.model.js';
import { signAccess, signRefresh, verifyRefresh } from './tokens.js';

// Used to equalise timing when the email does not exist (prevents user enumeration).
const DUMMY_HASH = bcrypt.hashSync('dummy-password-for-timing', 12);

type PublicUser = { id: string; name: string; email: string; role: string };
const toUser = (u: {
  _id: unknown;
  name: string;
  email: string;
  role?: string | null;
}): PublicUser => ({
  id: String(u._id),
  name: u.name,
  email: u.email,
  role: u.role ?? 'admin',
});

function issue(u: { _id: unknown; role?: string | null; tokenVersion?: number | null }) {
  const t = { id: String(u._id), role: u.role ?? 'admin', tokenVersion: u.tokenVersion ?? 0 };
  return { accessToken: signAccess(t), refreshToken: signRefresh(t) };
}

export const authService = {
  async login(email: string, password: string) {
    const user = await User.findOne({ email }).select('+passwordHash');
    const ok = await bcrypt.compare(password, user?.passwordHash ?? DUMMY_HASH);
    if (!user || !ok)
      throw ApiError.unauthorized('Invalid email or password', 'INVALID_CREDENTIALS');
    user.lastLoginAt = new Date();
    await user.save();
    return { user: toUser(user), ...issue(user) };
  },

  async refresh(token: string | undefined) {
    if (!token) throw ApiError.unauthorized('Missing refresh token');
    let payload;
    try {
      payload = verifyRefresh(token);
    } catch {
      throw ApiError.unauthorized('Invalid or expired refresh token');
    }
    const user = await User.findById(payload.sub);
    if (!user || payload.tv !== (user.tokenVersion ?? 0)) {
      throw ApiError.unauthorized('Refresh token revoked');
    }
    return { user: toUser(user), ...issue(user) };
  },

  async logout(token: string | undefined) {
    if (!token) return;
    try {
      const payload = verifyRefresh(token);
      await User.updateOne(
        { _id: payload.sub, tokenVersion: payload.tv },
        { $inc: { tokenVersion: 1 } },
      );
    } catch {
      /* invalid token: nothing to revoke */
    }
  },

  async me(id: string) {
    const user = await User.findById(id);
    if (!user) throw ApiError.unauthorized('User no longer exists');
    return toUser(user);
  },
};
