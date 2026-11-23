// Supabase 주소/키 — '우리 가족' 앱과 같은 프로젝트를 씁니다. (테이블 이름이 모두 qc_ 로 시작해서 겹치지 않아요)
// anon(publishable) key 는 공개되어도 되는 키입니다. 데이터 보호는 RLS 가 담당해요.
// 처음 한 번: Supabase SQL Editor 에서 supabase/schema.sql 을 실행해야 해요.
export const SUPABASE_URL = 'https://ivfeomuxwzxyzmixiyyv.supabase.co';
export const SUPABASE_ANON_KEY = 'sb_publishable_Og5uVBBt1QHOgCgX49OFbg_P7Xto2cC';

// 폰 알림(웹 푸시) 공개 키 — '우리 가족' 앱과 같은 키 (Supabase 함수 비밀값 VAPID_PUBLIC_KEY 와 같아야 해요)
export const VAPID_PUBLIC_KEY = 'BGx57Iq90RGR7c18tqRfVcbzRJ8bTfABnPdN32TUKbnb5fFqtEU8zpkgLRgd_g75rX9F25y6FRm7OlpoWrUD-C8';
