require('dotenv').config();

const readline = require('readline/promises');
const { stdin, stdout } = require('process');
const bcrypt = require('bcryptjs');
const mongoose = require('mongoose');
const Mentor = require('../models/Mentor');
const { PASSWORD_MIN_LENGTH, validateProfile } = require('../app');

async function promptForMentor() {
  const prompt = readline.createInterface({ input: stdin, output: stdout });
  try {
    const name = (await prompt.question('Mentor display name: ')).trim();
    const mentorId = (await prompt.question('Mentor ID (students will use this to request you): ')).trim().toUpperCase();
    const email = (await prompt.question('Mentor email: ')).trim().toLowerCase();
    const dateOfBirth = (await prompt.question('Date of birth (YYYY-MM-DD): ')).trim();
    const gender = (await prompt.question('Gender (female/male/non_binary/prefer_not_to_say): ')).trim();
    const department = (await prompt.question('Department: ')).trim();
    const mobileNumber = (await prompt.question('Mobile number: ')).trim();
    const password = await prompt.question(`Password (at least ${PASSWORD_MIN_LENGTH} characters): `);
    const error = validateProfile({ name, mentorId, email, dateOfBirth, gender, department, mobileNumber }, { mentor: true });
    if (error) {
      throw new Error(error);
    }
    if (password.length < PASSWORD_MIN_LENGTH || Buffer.byteLength(password, 'utf8') > 72) {
      throw new Error(`Password must be ${PASSWORD_MIN_LENGTH}-72 bytes long.`);
    }
    return { name, mentorId, email, dateOfBirth, gender, department, mobileNumber, password };
  } finally {
    prompt.close();
  }
}

async function main() {
  const { name, mentorId, email, dateOfBirth, gender, department, mobileNumber, password } = await promptForMentor();
  await mongoose.connect(process.env.MONGO_URI || 'mongodb://127.0.0.1:27017/mentorSystem');
  if (await Mentor.exists({ email })) {
    throw new Error(`A mentor account already exists for email "${email}".`);
  }
  if (await Mentor.exists({ mentorId })) {
    throw new Error(`Mentor ID "${mentorId}" is already in use.`);
  }
  const mentor = await Mentor.create({
    mentorId,
    username: mentorId,
    name,
    email,
    dateOfBirth,
    gender,
    department,
    mobileNumber,
    passwordHash: await bcrypt.hash(password, 12)
  });
  console.log(`Mentor account "${email}" created. Mentor ID: ${mentor.mentorId}`);
}

main()
  .catch((error) => {
    console.error('Could not create mentor account:', error.message);
    process.exitCode = 1;
  })
  .finally(() => mongoose.disconnect());
