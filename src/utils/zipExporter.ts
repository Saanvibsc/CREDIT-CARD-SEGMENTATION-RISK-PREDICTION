import JSZip from 'jszip';
import { PROJECT_FILES } from './projectFilesContent';

export async function exportProjectZip(filename = 'creditguard-ai-frontend.zip') {
  const zip = new JSZip();

  // Add all project files into the zip archive
  for (const [filepath, content] of Object.entries(PROJECT_FILES)) {
    zip.file(filepath, content);
  }

  // Generate binary zip blob
  const blob = await zip.generateAsync({
    type: 'blob',
    compression: 'DEFLATE',
    compressionOptions: { level: 6 },
  });

  // Trigger instant browser download
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);

  setTimeout(() => {
    URL.revokeObjectURL(url);
  }, 1000);

  return true;
}
