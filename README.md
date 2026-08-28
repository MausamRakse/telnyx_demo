# Telnyx Unified AI Calling Agent

This project is a comprehensive AI Calling Agent built using Telnyx for real-time communications. It supports both inbound and outbound voice calls powered by AI assistants. The application features a modular Python FastAPI backend and a modern React frontend.

## 🚀 Features

- **Inbound Calling:** Automatically answers incoming calls and routes them to an AI assistant.
- **Outbound Calling:** Trigger automated outbound calls to users through the dashboard or API.
- **Unified Architecture:** A robust FastAPI backend managing call control and webhooks, paired with a sleek React + TailwindCSS frontend.
- **Dynamic Webhook Management:** Integrated with `ngrok` to seamlessly expose local servers to Telnyx for webhook events.

## 🛠️ Technology Stack

### Backend
- **Framework:** Python / FastAPI
- **Webhooks & Tunnels:** `ngrok` for exposing local endpoints
- **Telephony Provider:** Telnyx API

### Frontend
- **Framework:** React 19 + Vite
- **Styling:** Tailwind CSS + PostCSS
- **State Management:** Zustand
- **Icons:** Lucide React

## 📂 Project Structure

```
telnyx_demo/
├── backend/            # FastAPI Application
│   ├── api/            # API Routes (Call routing, Webhooks, etc.)
│   ├── schemas/        # Pydantic schemas for data validation
│   ├── services/       # Core business logic for handling calls & AI
│   ├── utils/          # Helper modules and Telnyx Client configuration
│   └── main.py         # Application Entrypoint
├── frontend/           # React Web Interface
│   ├── src/            # Source code for components, pages, hooks
│   └── package.json    # Frontend dependencies
├── start.sh            # One-click startup script (Server + ngrok)
├── build.sh            # Script to build frontend and prepare backend
└── Dockerfile          # Containerization for production deployment
```

## 🏁 Getting Started

### Prerequisites
- Python 3.9+
- Node.js & npm
- [ngrok](https://ngrok.com/) installed and configured
- A [Telnyx](https://telnyx.com/) account with an active number and API key

### Installation

1. **Clone the repository** (if not already done):
   ```bash
   git clone <your-repo-url>
   cd telnyx_demo
   ```

2. **Configure Environment Variables:**
   Set up your `.env` file in the `backend/` directory with your Telnyx API credentials:
   ```env
   TELNYX_API_KEY=your_api_key
   TELNYX_CONNECTION_ID=your_connection_id
   APP_ENV=development
   ```

3. **Install Dependencies:**
   - **Backend:** `pip install -r backend/requirements.txt`
   - **Frontend:** `cd frontend && npm install`

### Running the Application Locally

You can launch both the FastAPI backend and the ngrok tunnel easily using the provided script:

```bash
bash start.sh
```

**What happens?**
- The FastAPI backend starts on `http://localhost:8001`.
- `ngrok` starts a tunnel for port `8001`.
- The script automatically fetches the public ngrok URL and prints it.
- **Action Required:** Update your Telnyx Call Control application's webhook URL to `<YOUR_NGROK_URL>/webhook`.

### Testing Calls

- **Inbound:** Dial your Telnyx phone number from any phone.
- **Outbound:** Trigger a call manually via the script:
  ```bash
  python3 backend/make_call.py +1234567890
  ```

## 📝 License

This project is licensed under the MIT License.
