# AI + IVR = AIVR

This project will generate images from text using AI. Compostite those with a logo and send it out via a Twilio API

![OG Image](/public/ogimage.png)

## Running Locally

To run this locally, you'll need to configure either OpenAI or Azure OpenAI. The application will automatically detect which API to use based on which API keys are provided in your `.env` file.

### Option 1: Using OpenAI Directly

Set the following environment variable:
- `OPENAI_API_KEY`: Your OpenAI API key (you can get one at https://openai.com, $18 of free credit is available for new users)

### Option 2: Using Azure OpenAI

Set the following environment variables:
- `AZURE_OPENAI_API_KEY`: Your Azure OpenAI API key
- `AZURE_OPENAI_ENDPOINT`: Your Azure OpenAI endpoint (e.g., `https://your-resource-name.openai.azure.com`)
- `AZURE_OPENAI_DEPLOYMENT_NAME`: The name of your DALL-E deployment
- `AZURE_OPENAI_API_VERSION`: The API version to use (defaults to `2024-02-15-preview`)

You can get these values from your Azure Portal after creating an Azure OpenAI resource and deployment.

**Note:** The application will prioritize `OPENAI_API_KEY` if both are provided. If neither is configured, the application will return an error.

Then, run the application in the command line and it will be available at `http://localhost:3000`.

```bash
npm run dev
```

## Running with Docker

This project can be run using Docker for easier deployment and consistent environments.

### Prerequisites

- Docker and Docker Compose installed on your system
- All required environment variables configured

### Required Environment Variables

Create a `.env` file in the root directory with the following variables:

**OpenAI Configuration (choose one option):**

- Option 1: Direct OpenAI
  - `OPENAI_API_KEY`: Your OpenAI API key

- Option 2: Azure OpenAI
  - `AZURE_OPENAI_API_KEY`: Your Azure OpenAI API key
  - `AZURE_OPENAI_ENDPOINT`: Your Azure OpenAI endpoint
  - `AZURE_OPENAI_DEPLOYMENT_NAME`: The name of your DALL-E deployment
  - `AZURE_OPENAI_API_VERSION`: The API version (defaults to `2024-02-15-preview`)

**Required for Twilio Integration:**
- `TWILIO_ACCOUNT_SID`: Your Twilio Account SID
- `TWILIO_AUTH_TOKEN`: Your Twilio Auth Token
- `TWILIO_WHATSAPP_FROM_NUMBER`: Your Twilio WhatsApp from number

**Required for API Security:**
- `API_KEY`: Your API key for securing endpoints

**Required for Supabase:**
- `SUPABASE_PROJECT_URL`: Your Supabase project URL
- `SUPABASE_SECRET_KEY`: Your Supabase secret key

**Required for Upstash QStash:**
- `QSTASH_TOKEN`: Your Upstash QStash token

**Optional Configuration:**
- `NEXT_PUBLIC_BASE_URL`: Base URL for the application (defaults to `http://localhost:3000`)
- `BASE_URL`: Base URL for the application (defaults to `http://localhost:3000`)
- `PORT`: Port number (defaults to `3000`)
- `NGROK_URL`: Ngrok URL if using ngrok for webhooks

### Option 1: Using Docker Compose (Recommended)

1. Create a `.env` file in the root directory with all required environment variables.

2. Build and run the container:
```bash
docker-compose up --build
```

3. The application will be available at `http://localhost:3000`.

4. To run in detached mode (background):
```bash
docker-compose up -d --build
```

5. To stop the container:
```bash
docker-compose down
```

### Option 2: Using Docker Directly

1. Build the Docker image:
```bash
docker build -t aivr-app .
```

2. Run the container with environment variables:
```bash
docker run -p 3000:3000 \
  -e OPENAI_API_KEY=your_openai_key \
  -e TWILIO_ACCOUNT_SID=your_twilio_sid \
  -e TWILIO_AUTH_TOKEN=your_twilio_token \
  -e TWILIO_WHATSAPP_FROM_NUMBER=your_whatsapp_number \
  -e API_KEY=your_api_key \
  -e SUPABASE_PROJECT_URL=your_supabase_url \
  -e SUPABASE_SECRET_KEY=your_supabase_secret \
  -e QSTASH_TOKEN=your_qstash_token \
  aivr-app
```

Or use an environment file:
```bash
docker run -p 3000:3000 --env-file .env aivr-app
```

3. The application will be available at `http://localhost:3000`.

### Viewing Logs

To view container logs when using Docker Compose:
```bash
docker-compose logs -f
```

Or for a single container:
```bash
docker logs -f <container-id>
```

### Production Deployment

For production deployment, ensure:
- All environment variables are properly set
- The container is run with appropriate resource limits
- Consider using a reverse proxy (nginx, traefik, etc.) in front of the container
- Set up proper logging and monitoring