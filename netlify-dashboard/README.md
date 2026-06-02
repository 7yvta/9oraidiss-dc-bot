# Netlify dashboard deploy

This dashboard is now single-file friendly.

Fast upload:
- Upload `index.html` alone to Netlify if your host only accepts one file.
- The CSS and JavaScript are embedded inside `index.html`.

Full upload:
- You can also upload `vault-netlify-dashboard.zip` from the `deploy` folder.

Required bot host variable on Railway/your bot host:
`DASHBOARD_API_TOKEN=your-long-secret-token`

Use the same token inside the dashboard login form.

Default API URL:
`https://shadow-production-be95.up.railway.app`
