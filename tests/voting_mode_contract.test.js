const fs = require('fs');
const path = require('path');

function read(name) {
  return fs.readFileSync(path.join(__dirname, '..', name), 'utf8');
}

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

const config = read('Config.gs');
const setup = read('Setup.gs');
const finalVoting = read('FinalVoting.gs');
const voting = read('Voting.gs');
const organizer = read('OrganizerSummary.gs');
const index = read('AppsScriptIndex.html');
const client = read('Client_Voting_Mode.html');

assert(
  config.includes("PORTAL_SCHEMA_VERSION = '4.4.0'") &&
    /Votes:[\s\S]*'Score', 'Rank'/.test(config),
  'Phase 4 must version the schema and add a Rank column without replacing Score.'
);

assert(
  setup.includes("'Voting Method': 'Rating'"),
  'Rating must remain the backward-compatible default voting method.'
);

assert(
  finalVoting.includes('normalizeVotingMethod_') &&
    finalVoting.includes('Voting method cannot be changed after votes have been cast'),
  'Organizer voting-method changes must be normalized and protected from mid-round switching.'
);

assert(
  voting.includes("method === 'Ranking'") &&
    voting.includes("'Rank': method === 'Ranking' ? rank : ''") &&
    voting.includes("'Score': method === 'Rating' ? score : ''") &&
    voting.includes('travelerVotes'),
  'Vote persistence must keep rating scores and ranking positions separate and return traveler vote state.'
);

assert(
  organizer.includes('nickname:') && organizer.includes('cabinId:') &&
    organizer.includes("method === 'Ranking'"),
  'Organizer vote summary must expose rental nickname + ID and support ranking.'
);

assert(
  index.includes("include('Styles_Voting_Mode')") &&
    index.includes("include('Client_Voting_Mode')"),
  'Voting mode client and styles must be loaded after the existing UI layers.'
);

const source = client
  .replace(/^\s*<script>\s*/, '')
  .replace(/\s*<\/script>\s*$/, '');
new Function(source);

[
  'votingMethod_',
  'votingLeaderboard_',
  'votingWinner_',
  'openVote=function',
  'saveVoteForm=function',
  'renderFinalVotingDashboard_=function',
  'renderJustinVotingSummary_=function'
].forEach((signature) => {
  assert(client.includes(signature), `Missing phase 4 client behavior: ${signature}`);
});

assert(
  client.includes('Voting method') &&
    client.includes('Rating · 1 to 5') &&
    client.includes('Ranking · 1st, 2nd, 3rd…'),
  'Organizer settings must offer Rating and Ranking.'
);

assert(
  !client.includes('name="voteReason"') &&
    !client.includes('voteFirstChoice'),
  'The phase 4 vote dialog must not reintroduce amenity reason or #1-choice checkboxes.'
);

assert(
  client.includes('WINNING RENTAL') &&
    client.includes('LIVE VOTING ORDER') &&
    client.includes('Most-voted rentals'),
  'Dashboard/rental UI must expose live vote order and a closed-voting winner.'
);

assert(
  client.includes('Rental ID:') && client.includes('item.nickname'),
  'Organizer traveler vote summary must visibly pair nickname with rental ID.'
);

console.log('PASS rating/ranking voting mode contracts');
