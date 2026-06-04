async function main() {
  const base = 'https://carebridge-dxrd.onrender.com/api';
  const endpoints = ['/auth/login', '/needs/urgent', '/facilities'];

  for (const endpoint of endpoints) {
    try {
      const res = await fetch(base + endpoint);
      const text = await res.text();
      console.log(endpoint, res.status, text.slice(0, 200));
    } catch (error) {
      console.log(endpoint, 'ERROR', error.message);
    }
  }
}

main();
