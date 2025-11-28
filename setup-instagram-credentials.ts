import readline from 'readline';
import fetch from 'node-fetch';

const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout,
});

function question(prompt: string): Promise<string> {
  return new Promise((resolve) => {
    rl.question(prompt, (answer) => {
      resolve(answer);
    });
  });
}

async function main() {
  console.log('=== Instagram Credentials Setup ===\n');

  // Step 1: Get App credentials
  const appId = await question('Enter your Facebook App ID: ');
  const appSecret = await question('Enter your Facebook App Secret: ');

  // Step 2: Get short-lived token
  console.log('\n--- Getting User Access Token ---');
  console.log('1. Go to: https://developers.facebook.com/tools/explorer/');
  console.log('2. Select your app: CatharsisAgent');
  console.log('3. Click "Add a Permission" and select:');
  console.log('   - instagram_basic');
  console.log('   - instagram_content_publish');
  console.log('   - pages_read_engagement');
  console.log('4. Click "Generate Access Token"\n');

  const shortToken = await question('Paste the short-lived token here: ');

  // Step 3: Exchange for long-lived token
  console.log('\n--- Exchanging for Long-Lived Token ---');
  const tokenUrl = `https://graph.facebook.com/v21.0/oauth/access_token?grant_type=fb_exchange_token&client_id=${appId}&client_secret=${appSecret}&fb_exchange_token=${shortToken}`;

  const tokenResponse = await fetch(tokenUrl);
  const tokenData: any = await tokenResponse.json();

  if (tokenData.error) {
    console.error('❌ Error getting long-lived token:', tokenData.error.message);
    rl.close();
    return;
  }

  const longLivedToken = tokenData.access_token;
  console.log('✓ Long-lived token obtained (valid for 60 days)\n');

  // Step 4: Get Instagram Account ID
  console.log('--- Getting Instagram Account ID ---');
  const accountUrl = `https://graph.facebook.com/v21.0/me/accounts?fields=instagram_business_account&access_token=${longLivedToken}`;

  const accountResponse = await fetch(accountUrl);
  const accountData: any = await accountResponse.json();

  if (accountData.error) {
    console.error('❌ Error getting account:', accountData.error.message);
    rl.close();
    return;
  }

  const instagramAccount = accountData.data?.[0]?.instagram_business_account;

  if (!instagramAccount) {
    console.error('❌ No Instagram Business Account found.');
    console.error('Make sure your Instagram account is:');
    console.error('1. Converted to Business/Creator account');
    console.error('2. Linked to your Facebook Page');
    rl.close();
    return;
  }

  const instagramAccountId = instagramAccount.id;
  console.log(`✓ Instagram Account ID: ${instagramAccountId}\n`);

  // Step 5: Output credentials
  console.log('=== Add these to your .env file ===\n');
  console.log(`INSTAGRAM_ACCESS_TOKEN=${longLivedToken}`);
  console.log(`INSTAGRAM_ACCOUNT_ID=${instagramAccountId}`);
  console.log('\n=== IMPORTANT ===');
  console.log('This token expires in 60 days. Re-run this script to refresh.');
  console.log('\nDon\'t forget to also get your ImgBB API key from: https://api.imgbb.com/');

  rl.close();
}

main().catch((error) => {
  console.error('Error:', error);
  rl.close();
});