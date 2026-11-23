import {execFile} from 'node:child_process';
import {fileURLToPath} from 'node:url';

const megabyte = 1024 * 1024;
const docxError = 'DOCX 문서를 읽지 못했습니다. 손상·암호·용량을 확인해주세요.';

function runTool(program, args, input, maxBuffer) {
  return new Promise((resolve, reject) => {
    const child = execFile(program, args, {encoding:'buffer', timeout:15000, maxBuffer},
      (error, stdout) => error ? reject(Error(docxError)) : resolve(stdout));
    child.stdin.on('error', () => {});
    child.stdin.end(input);
  });
}

export function safeXml(bytes) {
  const first = bytes[0], second = bytes[1];
  const encoding = (first === 255 && second === 254) || (first === 60 && second === 0)
    ? 'utf-16le' : (first === 254 && second === 255) || (first === 0 && second === 60) ? 'utf-16be' : 'utf-8';
  const text = new TextDecoder(encoding, {fatal:true}).decode(bytes);
  if (text.includes('\0') || /<!DOCTYPE|<!ENTITY/i.test(text)) throw Error(docxError);
  return text.replace(/^(<\?xml\s+[^?]*?\bencoding\s*=\s*)(['"])([^'"]+)\2/i,
    (_, before, quote, declared) => {
      if (!/^utf-(8|16|16be|16le)$/i.test(declared)) throw Error(docxError);
      return before + quote + 'UTF-8' + quote;
    });
}

export async function extractDocx(base64) {
  if (typeof base64 !== 'string' || base64.length > 28 * megabyte) throw Error(docxError);
  if (process.platform !== 'darwin') {
    const script = fileURLToPath(new URL('./read_docx.py', import.meta.url));
    return (await runTool('python3', [script], base64, 2200000)).toString('utf8');
  }
  const archive = Buffer.from(base64, 'base64');
  if (archive.length < 4 || archive.length > 20 * megabyte || archive.readUInt32LE(0) !== 0x04034b50) throw Error(docxError);
  const xml = await runTool('/usr/bin/bsdtar', ['-xOf','-','word/document.xml'], archive, 8 * megabyte);
  const stylesheet = fileURLToPath(new URL('./docx-text.xsl', import.meta.url));
  const text = (await runTool('/usr/bin/xsltproc',
    ['--nonet','--nowrite','--novalid','--nomkdir','--nodtdattr',stylesheet,'-'], safeXml(xml), 2200000)).toString('utf8');
  if ([...text].length > 500001) throw Error(docxError);
  return text;
}
