import { LibreDwg, Dwg_Object_Type } from '../vendor/libredwg/dist/libredwg-web.js';

export const MAX_BYTES = 40 * 1024 * 1024;
export const ERROR_NAMES = {
  1: '체크섬 불일치', 2: '미지원 형식', 4: '미지원 클래스', 8: '객체 형식 오류',
  16: '객체 참조 오류', 32: '확장 데이터 오류', 64: '데이터 범위 경고',
  128: '클래스 누락', 256: '도면 구역 누락', 512: '도면 페이지 누락',
  1024: '엔진 내부 오류', 2048: '손상되었거나 지원하지 않는 DWG',
  4096: '파일 읽기 실패', 8192: '메모리 부족'
};
export function validateDwg(bytes) {
  if (!(bytes instanceof Uint8Array)) throw new Error('파일 바이트가 필요합니다.');
  if (bytes.byteLength > MAX_BYTES) throw new Error('현재 버전은 40 MB 이하 DWG를 지원합니다.');
  if (bytes.byteLength < 128) throw new Error('DWG 파일이 너무 짧거나 손상되었습니다.');
  const signature = new TextDecoder('ascii').decode(bytes.slice(0, 6));
  if (!/^AC10\d{2}$/.test(signature)) throw new Error('DWG 원본 형식이 아닙니다. 확장자만 바꾼 PDF·DXF는 읽을 수 없습니다.');
  return signature;
}
export function errorDescriptions(code) {
  return Object.entries(ERROR_NAMES).filter(([bit]) => code & Number(bit)).map(([, label]) => label);
}
export async function readDwg(bytes, wasmDirectory) {
  const signature = validateDwg(bytes);
  const lib = await LibreDwg.create(wasmDirectory);
  const input = '/facade-input.dwg';
  let pointer = 0;
  let abandoned = false;
  try {
    lib.FS.writeFile(input, bytes);
    // The wrapper's dwg_read_data only logs errors. Keep raw error flags explicitly.
    const result = lib.dwg_read_file(input);
    pointer = result.data;
    if (result.error & 8192) {
      if (pointer) { lib.dwg_abandon(pointer); abandoned = true; }
      throw new Error('DWG 해석 중 메모리가 부족합니다. 도면을 분리해서 다시 업로드해주세요.');
    }
    if (!pointer || result.error >= 128) throw new Error(errorDescriptions(result.error).join(' · ') || 'DWG를 해석하지 못했습니다.');
    const { database, stats } = lib.convertEx(pointer);
    // convertEx omits the external filename. Read it before freeing the native DWG.
    const blocks=new Map((database.tables?.BLOCK_RECORD?.entries||[]).map(b=>[b.name,b]));
    for(const header of lib.dwg_getall_BLOCK_HEADER(pointer)){
      const name=lib.dwg_dynapi_entity_data(header,'name');
      const block=blocks.get(name);
      if(block&&(block.flags&12))block.xrefPath=lib.dwg_dynapi_entity_data(header,'xref_pname')||'';
    }
    // Inverted XCLIP metadata lives in the filter's extension dictionary.
    const filters=new Map((database.objects?.SPATIAL_FILTER||[]).map(f=>[f.handle,f]));
    if(filters.size){const wasm=lib.wasmInstance;for(let i=0;i<wasm.dwg_get_num_objects(pointer);i++){
      const obj=wasm.dwg_get_object(pointer,i);if(wasm.dwg_object_get_fixedtype(obj)!==Dwg_Object_Type.DWG_TYPE_SPATIAL_FILTER)continue;
      const handle=lib.dwg_object_get_handle_object(obj).value.toString(16).toUpperCase(),f=filters.get(handle);
      const ref=lib.dwg_object_object_get_xdicobjhandle_object(wasm.dwg_object_get_tio(obj));
      if(f&&ref?.absolute_ref)f.extensionDictionary=ref.absolute_ref.toString(16).toUpperCase();
    }}
    return { database, stats, errorCode: result.error, signature, engine: 'LibreDWG Web 0.8.8' };
  } finally {
    if (pointer && !abandoned) lib.dwg_free(pointer);
    if (lib.FS.analyzePath(input).exists) lib.FS.unlink(input);
  }
}
