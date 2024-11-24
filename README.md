# AI Review Agent


## Setup

1. Download NGROK [here](https://download.ngrok.com/). This will be used to create a secure tunnel to your local server.

2. Run NGROK in your terminal with the following command:

```
ngrok http 3000
```

Here you'll see a URL in the format of `https://<random>.ngrok.app`. Make sure to save this URL as you'll need it to configure your GitHub App.

3. Create a new [GitHub App here](https://github.com/settings/apps)

- Make sure to paste the NGROK URL + `/api/review` (e.g. `https://4836-204-48-36-234.ngrok-free.app/api/review`) as the "Webhook URL"
- Create a webhook secret, this can be anything and then paste it in the "secret" field when setting up the GitHub app
- Make sure to grant the app the read & write permissions for the following:
  - Pull Requests
  - Repository Contents
  - Issues
  - Commit Statuses
  - Webhooks
- Subscribe to the following events:

  - Pull Request
  - Pull Request Review
  - Pull Request Review Comment
  - Pull Request Comment Thread
  - Commit Comment

- Download your private key - this will be used later on to authenticate your app

- Install your GitHub app to all of your repositories

4. Clone the repo

```
git clone https://github.com/CoderAgent/SecureAgent
cd SecureAgent
```

5. Install dependencies

```
npm install
```

6. Get your Groq API key [here](https://console.groq.com/keys). Through Groq, you'll have free access to the Llama and Gemini models.

7. Create a `.env` file in the root of the project with the following variables:

```
GITHUB_PRIVATE_KEY="-----BEGIN RSA PRIVATE KEY-----
<your-github-private-key>
-----END RSA PRIVATE KEY-----"
GITHUB_APP_ID=<your-app-id>
GITHUB_WEBHOOK_SECRET=<your-webhook-secret>
GROQ_API_KEY=<your-groq-api-key>
```

Make sure your GITHUB_PRIVATE_KEY is formatted correctly, with the "--- BEGIN RSA PRIVATE KEY ---" and "--- END RSA PRIVATE KEY ---" lines, and is enclosed in quotes.

8. Within the `SecureAgent` directory in your IDE, run the code with the following command:

```
npm run start
```

9. Create a pull request on one of your repositories and watch the review agent submit a review!
  - Make sure to create the pull request on a repository that your GitHub app has access to.
  - Make sure the pull request has at least one changed file that is supported by the review agent. The following file extensions are ignored: ".pdf", ".png", ".jpg", ".jpeg", ".gif", ".mp4", ".mp3", ".md", ".json", ".env", ".toml", and ".svg".
  - You will have to create new pull requests each time to test the review agent, as it will not work on the same pull request twice.
