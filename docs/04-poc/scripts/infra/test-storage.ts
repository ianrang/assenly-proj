/**
 * P0-27: Supabase Storage 테스트
 *
 * 버킷 생성 → 이미지 업로드 → Public URL 획득 → 삭제 (정리)
 *
 * 실행: npx tsx docs/04-poc/scripts/infra/test-storage.ts
 */
import { createServiceClient, printResult } from './helpers.js';

const TEST_BUCKET = 'poc-test-images';
const TEST_FILE_NAME = 'test-image.txt'; // 텍스트로 대체 (실제 이미지 불필요)
const TEST_CONTENT = 'This is a test file for PoC storage verification.';

async function main() {
  console.log('=== P0-27: Supabase Storage Test ===\n');

  const supabase = createServiceClient();
  let allPass = true;

  // 1. 버킷 생성
  console.log('--- 1. Create bucket ---');
  try {
    const { data, error } = await supabase.storage.createBucket(TEST_BUCKET, {
      public: true,
      fileSizeLimit: 5 * 1024 * 1024, // 5MB (PRD P0-8 요구사항)
      allowedMimeTypes: ['image/jpeg', 'image/png', 'image/webp', 'text/plain'],
    });

    if (error) {
      if (error.message.includes('already exists')) {
        printResult('Create bucket', true, `"${TEST_BUCKET}" already exists`);
      } else {
        throw error;
      }
    } else {
      printResult('Create bucket', true, `"${TEST_BUCKET}" created`);
    }
  } catch (err) {
    printResult('Create bucket', false, err instanceof Error ? err.message : String(err));
    allPass = false;
  }

  // 2. 파일 업로드
  console.log('\n--- 2. Upload file ---');
  try {
    const blob = new Blob([TEST_CONTENT], { type: 'text/plain' });
    const { data, error } = await supabase.storage
      .from(TEST_BUCKET)
      .upload(TEST_FILE_NAME, blob, {
        contentType: 'text/plain',
        upsert: true,
      });

    if (error) throw error;
    printResult('Upload file', true, `path=${data.path}`);
  } catch (err) {
    printResult('Upload file', false, err instanceof Error ? err.message : String(err));
    allPass = false;
  }

  // 3. Public URL 획득
  console.log('\n--- 3. Get public URL ---');
  try {
    const { data } = supabase.storage
      .from(TEST_BUCKET)
      .getPublicUrl(TEST_FILE_NAME);

    const hasUrl = !!data.publicUrl;
    printResult('Public URL', hasUrl, hasUrl ? data.publicUrl : 'No URL returned');

    // URL 접근 가능 확인
    if (hasUrl) {
      try {
        const response = await fetch(data.publicUrl);
        const ok = response.ok;
        printResult('URL accessible', ok, `status=${response.status}`);
        if (!ok) allPass = false;
      } catch (fetchErr) {
        printResult('URL accessible', false, 'Fetch failed');
        allPass = false;
      }
    }
  } catch (err) {
    printResult('Public URL', false, err instanceof Error ? err.message : String(err));
    allPass = false;
  }

  // 4. 파일 목록 조회
  console.log('\n--- 4. List files ---');
  try {
    const { data, error } = await supabase.storage
      .from(TEST_BUCKET)
      .list();

    if (error) throw error;
    const found = data?.some((f) => f.name === TEST_FILE_NAME);
    printResult('List files', !!found, `${data?.length ?? 0} files, test file ${found ? 'found' : 'NOT found'}`);
    if (!found) allPass = false;
  } catch (err) {
    printResult('List files', false, err instanceof Error ? err.message : String(err));
    allPass = false;
  }

  // 5. 정리 (파일 + 버킷 삭제)
  console.log('\n--- 5. Cleanup ---');
  try {
    // 파일 삭제
    const { error: rmErr } = await supabase.storage
      .from(TEST_BUCKET)
      .remove([TEST_FILE_NAME]);
    if (rmErr) throw rmErr;
    printResult('Delete file', true);

    // 버킷 삭제
    const { error: bucketErr } = await supabase.storage.deleteBucket(TEST_BUCKET);
    if (bucketErr) {
      printResult('Delete bucket', false, bucketErr.message);
    } else {
      printResult('Delete bucket', true);
    }
  } catch (err) {
    printResult('Cleanup', false, err instanceof Error ? err.message : String(err));
  }

  console.log(`\n=== P0-27 Verdict: ${allPass ? 'PASS' : 'FAIL'} ===`);
}

main().catch((err) => {
  console.error('Unexpected error:', err);
  process.exit(1);
});
