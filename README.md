# ClickUp Task Automation Portal

Internal portal for uploading requirement documents (DOCX/TXT) and automatically creating ClickUp tasks for Backend, Mobile, QA, and DevOps teams.

## Features

- Drag-and-drop file upload with Bootstrap 5 UI
- DOCX parsing via Mammoth, TXT plain-text support
- Section-based document parsing (BACKEND, MOBILE, QA, DEVOPS teams)
- ClickUp API integration with assignee mapping
- Results page with task IDs, assignees, and status
- Production-ready: Helmet, rate limiting, file validation, error handling

## Project Structure

```
clickup-task-portal/
├── app.js              # Express server & upload API
├── parser.js           # Document parsing logic
├── clickup.js          # ClickUp API integration
├── users.json          # Assignee name → ClickUp user ID mapping
├── ecosystem.config.js # PM2 process configuration
├── deploy/
│   └── nginx.conf      # Nginx reverse proxy config
├── public/
│   ├── css/styles.css
│   ├── js/app.js
│   ├── js/results.js
│   ├── index.html
│   └── results.html
├── samples/
│   └── sample-requirement.txt
├── uploads/            # Temporary upload storage (auto-cleaned)
├── .env.example
└── package.json
```

## Quick Start (Local Development)

### 1. Prerequisites

- Node.js 18+
- ClickUp Personal API Token
- ClickUp List ID where tasks will be created

### 2. Install Dependencies

```bash
cd clickup-task-portal
npm install
```

### 3. Configure Environment

```bash
cp .env.example .env
```

Edit `.env`:

```env
PORT=3000
NODE_ENV=development
CLICKUP_API_TOKEN=pk_your_token_here
CLICKUP_LIST_ID=your_list_id_here
MAX_FILE_SIZE_MB=5
```

### 4. Configure User Mapping

Edit `users.json` with your team's ClickUp user IDs:

```json
{
  "Rahul": 123456,
  "Amit": 789012
}
```

To find ClickUp user IDs, use the [ClickUp API](https://clickup.com/api) `GET /team` endpoint or inspect team member settings.

### 5. Run the Application

```bash
npm start
```

Open [http://localhost:3000](http://localhost:3000) and upload `samples/sample-requirement.txt`.

---

## Document Format

Each team section must use this structure. Sections that are missing or lack a Task Title are skipped.

```
BACKEND TEAM
Assignee: Rahul

Task Title:
Create User Login API

Requirements:

* JWT authentication
* Password hashing with bcrypt

MOBILE TEAM
Assignee: Amit

Task Title:
Build Login Screen

Requirements:

* Integrate with login API
```

Supported section headers (case-insensitive):

- `BACKEND TEAM`
- `MOBILE TEAM`
- `QA TEAM`
- `DEVOPS TEAM`

---

## Ubuntu EC2 Deployment

### 1. Server Setup

```bash
# Update system
sudo apt update && sudo apt upgrade -y

# Install Node.js 20 LTS
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
sudo apt install -y nodejs

# Install PM2 and Nginx
sudo npm install -g pm2
sudo apt install -y nginx
```

### 2. Deploy Application

```bash
# Clone or copy project to server
sudo mkdir -p /var/www/clickup-task-portal
sudo chown $USER:$USER /var/www/clickup-task-portal

# Copy files (from your machine)
scp -r ./clickup-task-portal/* user@your-ec2-ip:/var/www/clickup-task-portal/

# On the server
cd /var/www/clickup-task-portal
npm install --production

# Create environment file
cp .env.example .env
nano .env   # Add CLICKUP_API_TOKEN and CLICKUP_LIST_ID

# Secure .env permissions
chmod 600 .env

# Create logs directory for PM2
mkdir -p logs uploads
```

### 3. PM2 Commands

```bash
# Start application
pm2 start ecosystem.config.js

# View status
pm2 status

# View logs
pm2 logs clickup-task-portal

# Restart after config changes
pm2 restart clickup-task-portal

# Stop application
pm2 stop clickup-task-portal

# Enable auto-start on server reboot
pm2 startup
pm2 save
```

### 4. Nginx Configuration

```bash
# Copy config
sudo cp deploy/nginx.conf /etc/nginx/sites-available/clickup-task-portal

# Edit server_name to your domain/IP
sudo nano /etc/nginx/sites-available/clickup-task-portal

# Enable site
sudo ln -s /etc/nginx/sites-available/clickup-task-portal /etc/nginx/sites-enabled/

# Remove default site (optional)
sudo rm /etc/nginx/sites-enabled/default

# Test and reload
sudo nginx -t
sudo systemctl reload nginx
```

### 5. SSL with Let's Encrypt (Recommended)

```bash
sudo apt install -y certbot python3-certbot-nginx
sudo certbot --nginx -d tasks.yourcompany.com
```

### 6. Firewall

```bash
sudo ufw allow OpenSSH
sudo ufw allow 'Nginx Full'
sudo ufw enable
```

---

## API Endpoints

| Method | Endpoint       | Description                    |
|--------|----------------|--------------------------------|
| GET    | `/api/health`  | Health check for load balancers |
| POST   | `/api/upload`  | Upload document, create tasks   |

### Upload Response Example

```json
{
  "success": true,
  "message": "Successfully created 4 task(s) in ClickUp.",
  "summary": { "total": 4, "created": 4, "failed": 0 },
  "results": [
    {
      "team": "BACKEND TEAM",
      "taskTitle": "Create User Login API",
      "assignee": "Rahul",
      "status": "created",
      "clickupTaskId": "abc123",
      "clickupUrl": "https://app.clickup.com/t/abc123",
      "clickupStatus": "Open",
      "warning": null,
      "error": null
    }
  ]
}
```

---

## Error Handling & Validation

| Scenario                         | HTTP | Message                                              |
|----------------------------------|------|------------------------------------------------------|
| No file uploaded                 | 400  | No file uploaded. Please select a .docx or .txt file.|
| Invalid file type                | 400  | Invalid file type. Only .docx and .txt allowed.      |
| File too large                   | 400  | File too large. Maximum allowed size is 5 MB.        |
| Empty document                   | 422  | The uploaded document is empty.                      |
| No team sections found           | 422  | No valid team sections found.                        |
| Assignee not in users.json       | —    | Task created unassigned (warning in results)         |
| ClickUp API failure              | —    | Per-task error shown in results table                |
| Rate limit exceeded              | 429  | Too many upload requests. Try again in 15 minutes.   |

---

## Security Best Practices

1. **Never commit `.env`** — API tokens stay on the server only (`chmod 600 .env`).
2. **Helmet** — Security headers including Content-Security-Policy.
3. **Rate limiting** — 30 uploads per 15 minutes per IP.
4. **File validation** — Extension, MIME type, and size checks via Multer.
5. **Upload cleanup** — Files deleted immediately after processing.
6. **Nginx reverse proxy** — Node.js not exposed directly to the internet.
7. **HTTPS** — Use SSL/TLS in production via Let's Encrypt or internal CA.
8. **Internal network** — Restrict access via VPN or security groups.
9. **Non-root process** — Run PM2 under a dedicated `www-data` or app user.
10. **Keep dependencies updated** — Run `npm audit` regularly.

---

## Troubleshooting

**Tasks created but not assigned**
- Verify assignee names in the document match `users.json` exactly.
- Confirm ClickUp user IDs are correct for your workspace.

**ClickUp API 401 Unauthorized**
- Regenerate your API token in ClickUp Settings → Apps.
- Ensure `CLICKUP_API_TOKEN` has no extra spaces.

**ClickUp API 404**
- Verify `CLICKUP_LIST_ID` is correct.
- Ensure the token has access to the workspace containing the list.

**Nginx 502 Bad Gateway**
- Check PM2 is running: `pm2 status`
- Verify app listens on port 3000: `curl http://127.0.0.1:3000/api/health`

---

## License

Internal use only. UNLICENSED.
