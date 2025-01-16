import mongoose from 'mongoose';
import { Personality } from './schemas';

const initialPersonalities = [
  {
    id: 1,
    name: 'Schizo-autist (obsessed, aggressive, paranoid)',
    description: null,
    createdAt: new Date('2024-11-26T23:40:45.217Z'),
    updatedAt: new Date('2024-11-26T23:40:45.217Z'),
    deletedAt: null
  },
  {
    id: 2,
    name: 'Teacher (educates, explains)',
    description: null,
    createdAt: new Date('2024-11-26T23:40:45.217Z'),
    updatedAt: new Date('2024-11-26T23:40:45.217Z'),
    deletedAt: null
  },
  {
    id: 3,
    name: 'Critic (analyzes, questions)',
    description: null,
    createdAt: new Date('2024-11-26T23:40:45.217Z'),
    updatedAt: new Date('2024-11-26T23:40:45.217Z'),
    deletedAt: null
  },
  {
    id: 4,
    name: 'Degen (hot takes, aggressive)',
    description: null,
    createdAt: new Date('2024-11-26T23:40:45.217Z'),
    updatedAt: new Date('2024-11-26T23:40:45.217Z'),
    deletedAt: null
  },
  {
    id: 5,
    name: 'Evil (malicious, destructive)',
    description: null,
    createdAt: new Date('2024-11-26T23:40:45.217Z'),
    updatedAt: new Date('2024-11-26T23:40:45.217Z'),
    deletedAt: null
  },
  {
    id: 6,
    name: 'Comedian (jokes, entertainer)',
    description: null,
    createdAt: new Date('2024-11-26T23:40:45.217Z'),
    updatedAt: new Date('2024-11-26T23:40:45.217Z'),
    deletedAt: null
  }
];

async function seedPersonalities() {
  try {
    // Connect to MongoDB
    await mongoose.connect(process.env.MONGODB_URI);
    
    // Clear existing personalities
    await Personality.deleteMany({});
    
    // Insert new personalities
    await Personality.insertMany(initialPersonalities);
    
    console.log('Successfully seeded personalities');
  } catch (error) {
    console.error('Error seeding personalities:', error);
  } finally {
    await mongoose.disconnect();
  }
}

// Run the seeding
seedPersonalities();