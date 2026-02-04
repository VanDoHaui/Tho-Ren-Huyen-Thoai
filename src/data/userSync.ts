import { doc, getDoc, onSnapshot, setDoc } from "firebase/firestore";
import { db } from "../firebase";

export type ReaderProgress = { lastChapterId: string; updatedAt: number };
export type ReaderTheme = "light" | "dark" | "paper";
export type ReaderPrefs = {
  theme: ReaderTheme;
  font: string;
  fontSize: number;
  updatedAt?: number;
};


function progressRef(uid: string, storyId: string) {
  return doc(db, "users", uid, "progress", storyId);
}
function prefsRef(uid: string, storyId: string) {
  return doc(db, "users", uid, "prefs", storyId);
}

export async function loadProgress(uid: string, storyId: string) {
  const snap = await getDoc(progressRef(uid, storyId));
  return snap.exists() ? (snap.data() as any as ReaderProgress) : undefined;
}

export async function saveProgress(uid: string, storyId: string, lastChapterId: string) {
  await setDoc(
    progressRef(uid, storyId),
    { lastChapterId, updatedAt: Date.now() },
    { merge: true }
  );
}

export function listenProgress(uid: string, storyId: string, cb: (p?: ReaderProgress) => void) {
  return onSnapshot(progressRef(uid, storyId), (snap) => {
    cb(snap.exists() ? (snap.data() as any as ReaderProgress) : undefined);
  });
}

export async function loadPrefs(uid: string, storyId: string) {
  const snap = await getDoc(prefsRef(uid, storyId));
  return snap.exists() ? (snap.data() as any as ReaderPrefs) : undefined;
}

export async function savePrefs(
  uid: string,
  storyId: string,
  prefs: { theme: ReaderTheme; font: string; fontSize: number }
) {
  await setDoc(prefsRef(uid, storyId), { ...prefs, updatedAt: Date.now() }, { merge: true });
}

export function listenPrefs(uid: string, storyId: string, cb: (p?: ReaderPrefs) => void) {
  return onSnapshot(prefsRef(uid, storyId), (snap) => {
    cb(snap.exists() ? (snap.data() as any as ReaderPrefs) : undefined);
  });
}
