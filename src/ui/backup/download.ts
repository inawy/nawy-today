import type { FileToSave } from '@/features/backup';

/** Hands a text file to the browser's own download. Nothing leaves the device. */
export function downloadFile(file: FileToSave): void {
  const url = URL.createObjectURL(new Blob([file.text], { type: 'application/json' }));
  const a = document.createElement('a');
  a.href = url;
  a.download = file.name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  // Revoked later: some browsers start the download after the click returns.
  setTimeout(() => URL.revokeObjectURL(url), 10_000);
}
