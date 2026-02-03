import { db } from "../firebase";
import {
  collection,
  deleteDoc,
  doc,
  getDoc,
  getDocs,
  limit,
  onSnapshot,
  orderBy,
  query,
  setDoc,
  writeBatch,
} from "firebase/firestore";

// =======================
// Types
// =======================

export type Chapter = {
  id: string;
  title: string;
  content: string;
  updatedAt: number;
};

export type Story = {
  id: string;
  title: string;
  author?: string;
  description?: string;
  updatedAt: number;
};

// =======================
// Paths
// =======================

function storyRef(storyId: string) {
  return doc(db, "stories", storyId);
}

function chaptersCol(storyId: string) {
  return collection(db, "stories", storyId, "chapters");
}

function chapterRef(storyId: string, chapterId: string) {
  return doc(db, "stories", storyId, "chapters", chapterId);
}

// =======================
// Story
// =======================

export async function getStory(storyId: string): Promise<Story | null> {
  const snap = await getDoc(storyRef(storyId));
  if (!snap.exists()) return null;
  const data = snap.data() as any;

  return {
    id: snap.id,
    title: data.title ?? "",
    author: data.author ?? "",
    description: data.description ?? "",
    updatedAt: data.updatedAt ?? 0,
  };
}

export async function upsertStory(story: Story) {
  await setDoc(
    storyRef(story.id),
    {
      title: story.title,
      author: story.author ?? "",
      description: story.description ?? "",
      updatedAt: story.updatedAt ?? Date.now(),
    },
    { merge: true }
  );
}

// =======================
// Chapters
// =======================

export async function getChapters(storyId: string): Promise<Chapter[]> {
  const qy = query(chaptersCol(storyId), orderBy("num", "asc"));
  const snap = await getDocs(qy);

  return snap.docs.map((d) => {
    const data = d.data() as any;
    return {
      id: d.id,
      title: data.title ?? "",
      content: data.content ?? "",
      updatedAt: data.updatedAt ?? 0,
    };
  });
}

export async function getChapter(
  storyId: string,
  chapterId: string
): Promise<Chapter | null> {
  const snap = await getDoc(chapterRef(storyId, chapterId));
  if (!snap.exists()) return null;
  const data = snap.data() as any;

  return {
    id: snap.id,
    title: data.title ?? "",
    content: data.content ?? "",
    updatedAt: data.updatedAt ?? 0,
  };
}

export async function upsertChapter(
  storyId: string,
  chapter: { id: string; title: string; content: string }
) {
  const now = Date.now();
  const num = Number(chapter.id) || 0;

  await setDoc(
    chapterRef(storyId, chapter.id),
    {
      id: chapter.id,
      num,
      title: chapter.title,
      content: chapter.content,
      updatedAt: now,
    },
    { merge: true }
  );

  // bump story.updatedAt
  await setDoc(storyRef(storyId), { updatedAt: now }, { merge: true });
}

/** ✅ realtime listen chapters */
export function listenChapters(
  storyId: string,
  cb: (chs: Chapter[]) => void
): () => void {
  const qy = query(chaptersCol(storyId), orderBy("num", "asc"));

  const unsub = onSnapshot(qy, (snap) => {
    const chs: Chapter[] = snap.docs.map((d) => {
      const data = d.data() as any;
      return {
        id: d.id,
        title: data.title ?? "",
        content: data.content ?? "",
        updatedAt: data.updatedAt ?? 0,
      };
    });
    cb(chs);
  });

  return unsub;
}

/** ✅ batch import (Admin dùng cái này) */
export async function batchUpsertChapters(
  storyId: string,
  chapters: Array<{ id: string; title: string; content: string }>
) {
  const now = Date.now();
  const batch = writeBatch(db);

  for (const ch of chapters) {
    const num = Number(ch.id) || 0;

    batch.set(
      chapterRef(storyId, ch.id),
      {
        id: ch.id,
        num,
        title: ch.title,
        content: ch.content,
        updatedAt: now,
      },
      { merge: true }
    );
  }

  // bump story.updatedAt 1 lần
  batch.set(storyRef(storyId), { updatedAt: now }, { merge: true });

  await batch.commit();
}

// =======================
// Delete
// =======================

export async function deleteChapter(storyId: string, chapterId: string) {
  await deleteDoc(chapterRef(storyId, chapterId));
  await setDoc(storyRef(storyId), { updatedAt: Date.now() }, { merge: true });
}

export async function deleteAllChapters(storyId: string) {
  const qy = query(chaptersCol(storyId), limit(500));
  const snap = await getDocs(qy);

  const batch = writeBatch(db);
  snap.docs.forEach((d) => batch.delete(d.ref));
  await batch.commit();

  await setDoc(storyRef(storyId), { updatedAt: Date.now() }, { merge: true });
}
