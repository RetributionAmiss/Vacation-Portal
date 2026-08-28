const PORTAL_SCHEMA_VERSION = '4.4.0';
const SPREADSHEET_ID = '16FJTnkhexYLFRC2NaIK6izIeH5wfbdXgJvdISt7X06A';
const APP_TITLE = 'Smoky Mountain Family Vacation Portal';
const GEMINI_MODEL = 'gemini-3.6-flash';
const IMPORT_TRIGGER_FUNCTION = 'processRentalEnrichmentQueue_';
const MAX_AI_HISTORY_CHARS = 45000;
const DEFAULT_VRBO_APIFY_ACTOR = 'memo23~vrbo-scraper';

const SCHEMAS = {
  Trip: ['Setting', 'Value'],
  Travelers: [
    'Traveler ID', 'Name', 'Email', 'Group', 'Traveler Type',
    'Parent/Guardian ID', 'Adults', 'Children',
    'Price Cap', 'Cost %', 'Pay More', 'Willing to Share Room',
    'Home Location', 'Notes', 'Active'
  ],
  Cabins: [
    'Cabin ID', 'Provider', 'Provider Property ID', 'Cabin Name', 'Nickname',
    'Rental URL', 'Original Rental URL', 'Location', 'Sleeps', 'Bedrooms',
    'Bathrooms', 'Total Rental Cost', 'Nightly Rate', 'Rating', 'Review Count',
    'Image URL', 'Photo URLs', 'Description', 'Amenities',
    'Cancellation Policy', 'Fees and Taxes', 'House Rules', 'Parking',
    'Accessibility', 'Nearby Highlights', 'Import Stage', 'Import Confidence',
    'Status', 'Submitted By', 'Created At', 'Updated At', 'Active'
  ],
  'Cabin Details': [
    'Detail ID', 'Cabin ID', 'Check In', 'Check Out', 'Minimum Age',
    'Pets', 'Pool', 'Hot Tub', 'Theater', 'Arcade', 'Kitchen',
    'Laundry', 'Outdoor Space', 'Internet', 'Latitude', 'Longitude',
    'Raw Structured Data', 'Confidence JSON', 'Updated At'
  ],
  'Cabin Photos': [
    'Photo ID', 'Cabin ID', 'Photo URL', 'Sort Order', 'Source', 'Created At'
  ],
  'Cabin Amenities': [
    'Amenity ID', 'Cabin ID', 'Amenity', 'Category', 'Source', 'Created At'
  ],
  Bedrooms: [
    'Bedroom ID', 'Cabin ID', 'Bedroom Name', 'Floor',
    'Bed Configuration', 'Sleeps', 'Private Bathroom', 'Notes'
  ],
  Votes: [
    'Vote ID', 'Cabin ID', 'Traveler ID', 'Score', 'Rank',
    'Notes', 'Reasons', 'First Choice', 'Voting Round', 'Created At'
  ],
  Comments: ['Comment ID', 'Cabin ID', 'Traveler ID', 'Comment', 'Created At'],
  Feedback: [
    'Feedback ID', 'Traveler ID', 'Traveler Name', 'Type', 'Summary',
    'What Happened', 'Expected Result', 'Steps to Reproduce', 'Portal View',
    'Page URL', 'Browser', 'Status', 'Created At', 'Updated At'
  ],
  Favorites: ['Favorite ID', 'Cabin ID', 'Traveler ID', 'Created At'],
  Assignments: ['Assignment ID', 'Cabin ID', 'Bedroom ID', 'Traveler ID', 'Created At'],
  Budget: [
    'Budget ID', 'Category', 'Description', 'Amount',
    'Include in Rental Split', 'Paid By', 'Split Between',
    'Due Date', 'Status', 'Notes'
  ],
  Meals: [
    'Meal ID', 'Date', 'Meal', 'Menu',
    'Assigned To', 'Clean Up', 'Notes'
  ],
  'Grocery List': [
    'Grocery ID', 'Store Section', 'Category', 'Item',
    'Quantity', 'Bringing', 'Brought By',
    'Assigned To', 'Purchased', 'Notes'
  ],
  Itinerary: [
    'Itinerary ID', 'Date', 'Start Time', 'End Time',
    'Activity', 'Location', 'Event URL', 'Assigned To',
    'Cost', 'Cost Per', 'Notes'
  ],
  'Rental Import': [
    'Import ID', 'Original URL', 'Canonical URL', 'Provider',
    'Provider Property ID', 'Submitted By', 'Submitted At', 'Status',
    'Cabin ID', 'Property Name', 'Notes', 'Updated At'
  ],
  'Rental Import Queue': [
    'Queue ID', 'Import ID', 'Cabin ID', 'Original URL', 'Canonical URL',
    'Provider', 'Status', 'Attempts', 'Last Error', 'Created At', 'Updated At'
  ],
  'Extension Capture Queue': [
    'Queue ID', 'Canonical Key', 'Submitted By', 'Submitted At', 'Status',
    'Payload JSON', 'Attempts', 'Last Error', 'Cabin ID', 'Updated At'
  ],
  'Rental Edit Queue': [
    'Queue ID', 'Cabin ID', 'Submitted By', 'Submitted At', 'Status',
    'Review Mode', 'Payload JSON', 'Attempts', 'Last Error', 'Updated At'
  ],
  'Rental Import Log': [
    'Log ID', 'Import ID', 'Cabin ID', 'Stage', 'Status',
    'Message', 'HTTP Status', 'Created At'
  ],
  'AI History': [
    'AI History ID', 'Import ID', 'Cabin ID', 'Model', 'Prompt Type',
    'Request URLs', 'Response JSON', 'Status', 'Error', 'Created At'
  ],
  Settings: ['Setting', 'Value']
};
