import ganache from 'ganache';
console.log('Ganache loaded successfully! typeof ganache.provider =', typeof ganache.provider);
const provider = ganache.provider({ logging: { quiet: true } });
console.log('Ganache provider created successfully!');
process.exit(0);
