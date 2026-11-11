const FALLBACK_CONFIG = {
  apiKey: 'AIzaSyAVqZ0RIRkMlA-uwwMJo68GODeeVDpUVeg',
  authDomain: 'expense-tracker-dd80b.firebaseapp.com',
  projectId: 'expense-tracker-dd80b',
  storageBucket: 'expense-tracker-dd80b.firebasestorage.app',
  messagingSenderId: '326086001523',
  appId: '1:326086001523:web:03b9b4a999d4dc2d343b06',
}

function config() {
  const env = import.meta.env || {}
  return {
    apiKey: env.VITE_FIREBASE_API_KEY || FALLBACK_CONFIG.apiKey,
    authDomain: env.VITE_FIREBASE_AUTH_DOMAIN || FALLBACK_CONFIG.authDomain,
    projectId: env.VITE_FIREBASE_PROJECT_ID || FALLBACK_CONFIG.projectId,
    storageBucket: env.VITE_FIREBASE_STORAGE_BUCKET || FALLBACK_CONFIG.storageBucket,
    messagingSenderId: env.VITE_FIREBASE_MESSAGING_SENDER_ID || FALLBACK_CONFIG.messagingSenderId,
    appId: env.VITE_FIREBASE_APP_ID || FALLBACK_CONFIG.appId,
  }
}

export function isCloudConfigured() {
  const c = config()
  return Boolean(c.apiKey && c.projectId && c.appId)
}

let firebasePromise = null

async function getFirebase() {
  if (!firebasePromise) {
    firebasePromise = (async () => {
      const [{ initializeApp, getApp, getApps }, authMod, firestoreMod] = await Promise.all([
        import('firebase/app'),
        import('firebase/auth'),
        import('firebase/firestore'),
      ])
      const app = getApps().length > 0 ? getApp() : initializeApp(config())
      const auth = authMod.getAuth(app)
      const db = firestoreMod.getFirestore(app)
      return { app, auth, db, authMod, firestoreMod }
    })()
  }
  return firebasePromise
}

function userInfo(firebaseUser) {
  if (!firebaseUser) return null
  return {
    uid: firebaseUser.uid,
    email: firebaseUser.email || '',
    displayName: firebaseUser.displayName || (firebaseUser.email || '').split('@')[0],
    photoURL: firebaseUser.photoURL || '',
  }
}

export async function watchAuth(callback) {
  const { auth, authMod } = await getFirebase()
  return authMod.onAuthStateChanged(auth, (u) => callback(userInfo(u)))
}

export async function signUpWithEmail(email, password) {
  const { auth, authMod } = await getFirebase()
  const cred = await authMod.createUserWithEmailAndPassword(auth, email, password)
  return userInfo(cred.user)
}

export async function signInWithEmail(email, password) {
  const { auth, authMod } = await getFirebase()
  const cred = await authMod.signInWithEmailAndPassword(auth, email, password)
  return userInfo(cred.user)
}

export async function signInWithGoogle() {
  const { auth, authMod } = await getFirebase()
  const provider = new authMod.GoogleAuthProvider()
  const cred = await authMod.signInWithPopup(auth, provider)
  return userInfo(cred.user)
}

export async function signOutUser() {
  const { auth, authMod } = await getFirebase()
  await authMod.signOut(auth)
}

const CHUNK_SIZE = 700000

export async function loadCloudState(uid) {
  const { db, firestoreMod } = await getFirebase()
  const metaSnap = await firestoreMod.getDoc(firestoreMod.doc(db, 'trackers', uid))
  if (!metaSnap.exists()) return null
  const count = Number(metaSnap.data().chunkCount || 0)
  if (!count) return null
  const chunkDocs = await Promise.all(
    Array.from({ length: count }, (_, i) =>
      firestoreMod.getDoc(firestoreMod.doc(db, 'trackers', uid, 'chunks', String(i))),
    ),
  )
  if (chunkDocs.some((d) => !d.exists())) {
    throw new Error('Cloud data is incomplete. Try signing in again or upload this device\'s data.')
  }
  const json = chunkDocs.map((d) => String(d.data().data || '')).join('')
  const data = JSON.parse(json)
  if (!data || !Array.isArray(data.txns)) throw new Error('Cloud data is not a valid expense-tracker backup.')
  return data
}

export async function saveCloudState(uid, state) {
  const { db, firestoreMod } = await getFirebase()
  const json = JSON.stringify(state)
  const chunks = []
  for (let i = 0; i < json.length; i += CHUNK_SIZE) {
    chunks.push(json.slice(i, i + CHUNK_SIZE))
  }
  const existing = await firestoreMod.getDocs(firestoreMod.collection(db, 'trackers', uid, 'chunks'))
  const batch = firestoreMod.writeBatch(db)
  const meta = { chunkCount: chunks.length, updatedAt: firestoreMod.serverTimestamp(), version: 1 }
  if (json.length > 1000000 * 200) {
    throw new Error('This data is too large to sync (over 200 MB). Export a backup file instead.')
  }
  batch.set(firestoreMod.doc(db, 'trackers', uid), meta)
  chunks.forEach((data, i) => {
    batch.set(firestoreMod.doc(db, 'trackers', uid, 'chunks', String(i)), { data })
  })
  existing.forEach((d) => {
    const idx = Number(d.id)
    if (!Number.isNaN(idx) && idx >= chunks.length) batch.delete(d.ref)
  })
  await batch.commit()
  return { bytes: json.length, chunks: chunks.length }
}

export function cloudErrorHint(err) {
  const code = String((err && err.code) || '')
  const message = String((err && err.message) || err || '')
  if (code === 'failed-precondition' || /cloud firestore api has not been used|firestore.*disabled|not been used in project/i.test(message)) {
    return 'Cloud sync is not set up yet: Firestore is disabled in your Firebase project. Enable it in Firebase Console → Firestore Database, then paste the security rules from the setup steps.'
  }
  if (code === 'permission-denied' || /insufficient permissions|permission/i.test(message)) {
    return 'Firestore rules are blocking sync. Open the setup steps below and paste the security rules into Firestore → Rules.'
  }
  if (code === 'unavailable' || /network|offline/i.test(message)) {
    return 'Could not reach the cloud. Check your internet connection and try again.'
  }
  if (code === 'auth/unauthorized-domain') {
    return 'This site is not authorized in Firebase. Add darshans8190.github.io in Authentication → Settings → Authorized domains.'
  }
  if (code === 'auth/operation-not-allowed') {
    return 'Email/password sign-in is disabled in your Firebase project. Enable it in Authentication → Sign-in method.'
  }
  if (code === 'auth/popup-blocked') return 'The sign-in popup was blocked. Allow popups for this site and try again.'
  if (code === 'auth/popup-closed-by-user' || code === 'auth/cancelled-popup-request') {
    return 'Google sign-in was closed before finishing.'
  }
  if (code === 'auth/invalid-credential' || code === 'auth/wrong-password' || code === 'auth/user-not-found') {
    return 'Wrong email or password. If you are new, create an account first.'
  }
  if (code === 'auth/email-already-in-use') return 'This email already has an account — sign in instead.'
  if (code === 'auth/weak-password') return 'Password must be at least 6 characters.'
  if (code === 'auth/invalid-email') return 'That email address is not valid.'
  if (code === 'auth/too-many-requests') return 'Too many attempts. Wait a few minutes and try again.'
  return message ? `Cloud error: ${message.slice(0, 240)}` : 'Something went wrong with cloud sync.'
}

export const CLOUD_RULES = `rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {
    match /trackers/{uid} {
      allow read, write: if request.auth != null && request.auth.uid == uid;
      match /chunks/{chunkId} {
        allow read, write: if request.auth != null && request.auth.uid == uid;
      }
    }
  }
}`
