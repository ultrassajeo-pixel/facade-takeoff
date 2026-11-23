import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {extractDocx, safeXml} from '../docx-reader.mjs';

test('macOS DOCX intake preserves the Korean construction specification without developer tools', {skip:process.platform !== 'darwin'}, async () => {
  const example = await readFile(new URL('./fixtures/sample-spec.docx', import.meta.url));
  const text = await extractDocx(example.toString('base64'));
  assert.match(text, /판넬 유효폭: 1000 mm[\s\S]*하지 간격: 1,200 mm/);
  await assert.rejects(extractDocx('invalid document'));
});

test('DOCX intake validates the XML in its declared encoding before using system tools', () => {
  const text = '<?xml version="1.0" encoding="UTF-16"?><w>문서</w>';
  const utf16 = Buffer.concat([Buffer.from([255,254]), Buffer.from(text, 'utf16le')]);
  assert.match(safeXml(utf16), /encoding="UTF-8"/i);
  assert.throws(() => safeXml(Buffer.from('<!DOCTYPE test><root/>')));
  assert.throws(() => safeXml(Buffer.from('<?xml version="1.0" encoding="iso-8859-1"?><w/>')));
});

test('installed app writes handed-off projects into user data outside its read-only bundle', async () => {
  const {mkdtemp, rm, stat} = await import('node:fs/promises');
  const {tmpdir} = await import('node:os');
  const {join} = await import('node:path');
  const directory = await mkdtemp(join(tmpdir(), 'facade-installed-data-'));
  const original = process.env.FACADE_PROJECT_DIRECTORY;
  try {
    process.env.FACADE_PROJECT_DIRECTORY = directory;
    const store = await import('../project-store.mjs?installation-test');
    const sample = JSON.parse(await readFile(new URL('../samples/facade_sample_complete.facade.json', import.meta.url)));
    await store.saveSharedProject(sample);
    assert.equal((await store.readSharedProject()).project.file.name, sample.file.name);
    assert.ok((await stat(join(directory, 'current-project.json'))).isFile());
  } finally {
    if (original === undefined) delete process.env.FACADE_PROJECT_DIRECTORY;
    else process.env.FACADE_PROJECT_DIRECTORY = original;
    await rm(directory, {recursive:true, force:true});
  }
});
