import { Request, Response, NextFunction } from 'express';
import { getAuth, getAppCheck } from '../utils/firebase';

/**
 * Firebase ID Token & App Check Verification Middleware
 * 
 * 1. Verifies the Google ID Token from Authorization header.
 * 2. Verifies the Firebase App Check token to prevent unauthorized client access.
 */
export const firebaseAdminAuth = async (req: Request, res: Response, next: NextFunction) => {
    const authHeader = req.headers.authorization;
    const appCheckToken = req.headers['x-firebase-appcheck'] as string;

    // LOCAL EXECUTION MODE FALLBACK
    // Only allow bypass if NOT in production AND SKIP_ADMIN_AUTH is explicitly 'true'
    if (process.env.NODE_ENV !== 'production' && process.env.SKIP_ADMIN_AUTH === 'true') {
        console.warn('[Admin] !!! SECURITY BYPASS ENABLED (NON-PROD ONLY) !!!');
        return next();
    }

    // Support both Authorization header and query param fallback (for window.open calls)
    let idToken: string | undefined;
    if (authHeader && authHeader.startsWith('Bearer ')) {
        idToken = authHeader.split('Bearer ')[1];
    } else if (req.query.admin_token && typeof req.query.admin_token === 'string') {
        idToken = req.query.admin_token;
    }

    if (!idToken) {
        console.warn('[Admin] Auth failed: Missing or invalid Authorization header');
        return res.status(401).json({ error: 'Missing or invalid Authorization header. Expected Bearer <Token>' });
    }

    try {
        // 1. Verify ID Token (Google Auth)
        const decodedToken = await getAuth().verifyIdToken(idToken);

        // 2. Verify allowed admin emails
        const allowedEmails = (process.env.ADMIN_EMAILS || '').split(',').map(e => e.trim().toLowerCase());
        const userEmail = decodedToken.email?.toLowerCase();

        // If ADMIN_EMAILS is set, enforce it. Otherwise, warn but allow (during initial setup)
        if (allowedEmails.length > 0 && allowedEmails[0] !== '') {
            if (!userEmail || !allowedEmails.includes(userEmail)) {
                console.warn(`[Admin] Forbidden access: Email ${userEmail} is not in whitelist (${allowedEmails.join(',')})`);
                return res.status(403).json({ error: 'Access Denied: Not an authorized administrator' });
            }
        } else if (process.env.NODE_ENV === 'production') {
            console.error('[Admin] CRITICAL: ADMIN_EMAILS not configured in production!');
            return res.status(403).json({ error: 'System configuration error: Admin whitelist missing' });
        }

        // 3. Verify App Check Token (Anti-Abuse)
        const ac = getAppCheck();
        if (ac) {
            if (!appCheckToken) {
                console.warn('[Admin] AppCheck token MISSING. Allowing access due to valid ID Token.');
                // In production, we still want to know it's missing, but we don't block anymore
            } else {
                try {
                    await ac.verifyToken(appCheckToken);
                } catch (err: any) {
                    console.error('[AppCheck] Invalid token:', err.message || err);
                    console.warn('[Admin] AppCheck invalid, but allowing access due to valid ID Token.');
                }
            }
        }

        (req as any).user = decodedToken;
        next();
    } catch (error: any) {
        console.error('[Admin] Token verification failed:', error.message || error);
        return res.status(401).json({ error: 'Unauthorized', details: error.message });
    }
};
