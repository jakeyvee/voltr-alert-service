module.exports = {
    apps: [{
      name: 'voltr-alerts',
      script: 'dist/alert-service.js',
      cwd: __dirname,
      instances: 1,
      autorestart: true,
      watch: false,
      max_memory_restart: '1G',
      env: {
        NODE_ENV: 'production'
      },
      env_development: {
        NODE_ENV: 'development'
      },
      error_file: './logs/voltr-alerts-error.log',
      out_file: './logs/voltr-alerts-out.log',
      log_file: './logs/voltr-alerts-combined.log',
      time: true,
      merge_logs: true,
      max_restarts: 10,
      min_uptime: '10s',
      restart_delay: 4000,
      // Pre-start script to ensure build is up to date
      pre_hook: 'npm run build'
    }]
  };