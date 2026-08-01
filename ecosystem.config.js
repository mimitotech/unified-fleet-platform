module.exports = {
  apps: [
    {
      name: 'mams',
      cwd: '/home/virtual/vps-e05b3d/2/27d5d7288d/repos/mams',
      script: 'npm',
      args: 'start',
      env: {
        NODE_ENV: 'production',
      },
      exp_backoff_restart_delay: 100,
    },
  ],
};
