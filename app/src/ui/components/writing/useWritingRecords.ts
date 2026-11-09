/** The writing practice records (progress/writingStore) for a screen, kept current on every write. */
import { useEffect, useState } from 'react';
import { cachedWritingRecords, loadWritingRecords, subscribeWritingRecords, type WritingRecords } from '../../../progress/writingStore';
import { useApp } from '../../hooks/useApp';

const EMPTY: WritingRecords = new Map();

export function useWritingRecords(): WritingRecords {
  const kk = useApp().db;
  const [records, setRecords] = useState<WritingRecords>(() => cachedWritingRecords(kk) ?? EMPTY);
  useEffect(() => {
    let alive = true;
    const unsubscribe = subscribeWritingRecords(kk, (r) => {
      if (alive) setRecords(r);
    });
    if (cachedWritingRecords(kk) === undefined) void loadWritingRecords(kk).catch(() => undefined);
    else setRecords(cachedWritingRecords(kk)!);
    return () => {
      alive = false;
      unsubscribe();
    };
  }, [kk]);
  return records;
}
