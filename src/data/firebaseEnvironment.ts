export function firebaseEnvironment(env: Record<string, string | boolean | undefined>, hostname: string) {
  const local = ['localhost','127.0.0.1','[::1]'].includes(hostname);
  const flag = env.VITE_USE_EMULATORS;
  if (flag !== undefined && flag !== 'true' && flag !== 'false') throw new Error('VITE_USE_EMULATORS true veya false olmalıdır.');
  const emulator = flag === 'true' || flag === undefined && local;
  if (emulator) {
    if (!local) throw new Error('Emulator bağlantısı yalnız localhost üzerinde kullanılabilir.');
    const test = env.VITE_SPARK_TEST === 'true';
    const projectId = test ? String(env.VITE_TEST_PROJECT_ID || 'demo-test-arena-spark-prototype') : 'demo-test-arena';
    if (!/^demo-[a-z0-9-]+$/.test(projectId)) throw new Error('Test emulatorü yalnız demo projesi kullanabilir.');
    const testPort=(key:string,fallback:number)=>{const port=Number(env[key]??fallback);if(!Number.isInteger(port)||port<1024||port>65535)throw Error('Geçersiz test emulator portu.');return port;};
    return {emulator, config:{projectId,apiKey:'demo-emulator-key',authDomain:`${projectId}.firebaseapp.com`},siteKey:'',ports:{auth:test?testPort('VITE_TEST_AUTH_PORT',9199):9099,firestore:test?testPort('VITE_TEST_FIRESTORE_PORT',8180):8080}};
  }
  const required = (key: string) => {
    const value = env[key];
    if (typeof value !== 'string' || !value.trim()) throw new Error(`Canlı Firebase ayarı eksik: ${key}`);
    return value.trim();
  };
  const projectId = required('VITE_FIREBASE_PROJECT_ID');
  if (projectId.startsWith('demo-') || projectId === 'yildizyarislari') throw new Error('Test Arena için ayrı bir canlı Firebase projesi gereklidir.');
  return {emulator:false,config:{projectId,apiKey:required('VITE_FIREBASE_API_KEY'),authDomain:required('VITE_FIREBASE_AUTH_DOMAIN'),appId:required('VITE_FIREBASE_APP_ID')},siteKey:typeof env.VITE_FIREBASE_APPCHECK_SITE_KEY === 'string' ? env.VITE_FIREBASE_APPCHECK_SITE_KEY.trim() : '',ports:{auth:9099,firestore:8080}};
}
