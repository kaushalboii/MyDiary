module.exports = {
  apps: [
    {
      name: "mydiary-storage",
      script: "./server.mjs",
      cwd: __dirname,
      instances: 1,
      exec_mode: "fork",
      autorestart: true,
      watch: false,
      max_memory_restart: "512M",
      env: {
        NODE_ENV: "production",
        PORT: 4321,
        HOST: "0.0.0.0",
      },
    },
  ],
};
