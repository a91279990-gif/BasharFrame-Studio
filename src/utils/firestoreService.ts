import {
  collection,
  deleteDoc,
  doc,
  getDoc,
  onSnapshot,
  orderBy,
  query,
  serverTimestamp,
  setDoc,
  Unsubscribe,
  where,
} from 'firebase/firestore';
import { User } from 'firebase/auth';
import { auth, db } from '../firebase';
import {
  BorderSettings,
  clampSettings,
  ExportRecordItem,
  SavedBorderPreset,
} from './borderConfig';

export enum OperationType {
  CREATE = 'create',
  UPDATE = 'update',
  DELETE = 'delete',
  LIST = 'list',
  GET = 'get',
  WRITE = 'write',
}

export interface FirestoreErrorInfo {
  error: string;
  operationType: OperationType;
  path: string | null;
  authInfo: {
    userId?: string | null;
    email?: string | null;
    emailVerified?: boolean | null;
    isAnonymous?: boolean | null;
    tenantId?: string | null;
    providerInfo?: {
      providerId?: string | null;
      email?: string | null;
    }[];
  };
}

export function handleFirestoreError(
  error: unknown,
  operationType: OperationType,
  path: string | null
): never {
  const errInfo: FirestoreErrorInfo = {
    error: error instanceof Error ? error.message : String(error),
    authInfo: {
      userId: auth.currentUser?.uid,
      email: auth.currentUser?.email,
      emailVerified: auth.currentUser?.emailVerified,
      isAnonymous: auth.currentUser?.isAnonymous,
      tenantId: auth.currentUser?.tenantId,
      providerInfo:
        auth.currentUser?.providerData?.map((provider) => ({
          providerId: provider.providerId,
          email: provider.email,
        })) || [],
    },
    operationType,
    path,
  };
  console.error('Firestore Error: ', JSON.stringify(errInfo));
  throw new Error(JSON.stringify(errInfo));
}

function generateSafeId(prefix: string): string {
  const randomPart =
    typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function'
      ? crypto.randomUUID().replace(/[^a-zA-Z0-9_-]/g, '')
      : `${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;
  return `${prefix}_${randomPart}`.slice(0, 128);
}

export async function ensureUserProfile(user: User): Promise<void> {
  const userPath = `users/${user.uid}`;
  const userRef = doc(db, 'users', user.uid);
  const displayName = (user.displayName || 'Studio Creator').trim().slice(0, 80) || 'Studio Creator';
  const photoURL = user.photoURL ? user.photoURL.slice(0, 512) : undefined;

  try {
    const snap = await getDoc(userRef);
    if (!snap.exists()) {
      const payload: Record<string, unknown> = {
        uid: user.uid,
        displayName,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      };
      if (photoURL) {
        payload.photoURL = photoURL;
      }
      await setDoc(userRef, payload);
    } else {
      const payload: Record<string, unknown> = {
        displayName,
        updatedAt: serverTimestamp(),
      };
      if (photoURL) {
        payload.photoURL = photoURL;
      }
      await setDoc(userRef, payload, { merge: true });
    }
  } catch (error) {
    handleFirestoreError(error, OperationType.WRITE, userPath);
  }
}

export async function savePresetToCloud(
  userId: string,
  name: string,
  settings: BorderSettings
): Promise<string> {
  const presetId = generateSafeId('preset');
  const docPath = `users/${userId}/presets/${presetId}`;
  const sanitized = clampSettings(settings);

  try {
    await setDoc(doc(db, 'users', userId, 'presets', presetId), {
      id: presetId,
      ownerId: userId,
      name: name.trim().slice(0, 64),
      paletteId: sanitized.paletteId,
      colors: sanitized.colors,
      borderWidth: sanitized.borderWidth,
      glowSpread: sanitized.glowSpread,
      glowIntensity: sanitized.glowIntensity,
      cornerRadius: sanitized.cornerRadius,
      stageMargin: sanitized.stageMargin,
      rotationSpeed: sanitized.rotationSpeed,
      direction: sanitized.direction,
      aspectRatio: sanitized.aspectRatio,
      backdropColor: sanitized.backdropColor,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });
    return presetId;
  } catch (error) {
    handleFirestoreError(error, OperationType.CREATE, docPath);
  }
}

export async function deletePresetFromCloud(userId: string, presetId: string): Promise<void> {
  const docPath = `users/${userId}/presets/${presetId}`;
  try {
    await deleteDoc(doc(db, 'users', userId, 'presets', presetId));
  } catch (error) {
    handleFirestoreError(error, OperationType.DELETE, docPath);
  }
}

export async function logExportToCloud(
  userId: string,
  record: Omit<ExportRecordItem, 'id' | 'ownerId' | 'createdAt'>
): Promise<string> {
  const exportId = generateSafeId('exp');
  const docPath = `users/${userId}/exports/${exportId}`;
  try {
    await setDoc(doc(db, 'users', userId, 'exports', exportId), {
      id: exportId,
      ownerId: userId,
      fileName: record.fileName.slice(0, 120),
      aspectRatio: record.aspectRatio,
      resolution: record.resolution.slice(0, 24),
      durationSec: Math.max(0, Math.min(7200, Number(record.durationSec) || 0)),
      fileSizeBytes: Math.max(0, Math.min(2147483648, Number(record.fileSizeBytes) || 0)),
      paletteName: record.paletteName.slice(0, 64),
      format: record.format,
      createdAt: serverTimestamp(),
    });
    return exportId;
  } catch (error) {
    handleFirestoreError(error, OperationType.CREATE, docPath);
  }
}

export async function deleteExportFromCloud(userId: string, exportId: string): Promise<void> {
  const docPath = `users/${userId}/exports/${exportId}`;
  try {
    await deleteDoc(doc(db, 'users', userId, 'exports', exportId));
  } catch (error) {
    handleFirestoreError(error, OperationType.DELETE, docPath);
  }
}

export function subscribeUserPresets(
  userId: string,
  onData: (presets: SavedBorderPreset[]) => void,
  onError: (err: Error) => void
): Unsubscribe {
  const path = `users/${userId}/presets`;
  const q = query(
    collection(db, 'users', userId, 'presets'),
    where('ownerId', '==', userId),
    orderBy('updatedAt', 'desc')
  );

  return onSnapshot(
    q,
    (snapshot) => {
      const items: SavedBorderPreset[] = snapshot.docs.map((d) => {
        const data = d.data();
        return {
          id: String(data.id || d.id),
          ownerId: String(data.ownerId || userId),
          name: String(data.name || 'Untitled Preset'),
          ...clampSettings(data as Partial<BorderSettings>),
          createdAt: data.createdAt,
          updatedAt: data.updatedAt,
        };
      });
      onData(items);
    },
    (error) => {
      try {
        handleFirestoreError(error, OperationType.LIST, path);
      } catch (wrapped) {
        onError(wrapped instanceof Error ? wrapped : new Error(String(wrapped)));
      }
    }
  );
}

export function subscribeUserExports(
  userId: string,
  onData: (exportsList: ExportRecordItem[]) => void,
  onError: (err: Error) => void
): Unsubscribe {
  const path = `users/${userId}/exports`;
  const q = query(
    collection(db, 'users', userId, 'exports'),
    where('ownerId', '==', userId),
    orderBy('createdAt', 'desc')
  );

  return onSnapshot(
    q,
    (snapshot) => {
      const items: ExportRecordItem[] = snapshot.docs.map((d) => {
        const data = d.data();
        return {
          id: String(data.id || d.id),
          ownerId: String(data.ownerId || userId),
          fileName: String(data.fileName || 'chromaframe.webm'),
          aspectRatio: (data.aspectRatio as ExportRecordItem['aspectRatio']) || '16:9',
          resolution: String(data.resolution || '1280x720'),
          durationSec: Number(data.durationSec || 0),
          fileSizeBytes: Number(data.fileSizeBytes || 0),
          paletteName: String(data.paletteName || 'Prism Spectrum'),
          format: (data.format as ExportRecordItem['format']) || 'webm',
          createdAt: data.createdAt,
        };
      });
      onData(items);
    },
    (error) => {
      try {
        handleFirestoreError(error, OperationType.LIST, path);
      } catch (wrapped) {
        onError(wrapped instanceof Error ? wrapped : new Error(String(wrapped)));
      }
    }
  );
}
