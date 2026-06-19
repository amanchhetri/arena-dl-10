-- 30 preset challenges per Doc C §3.
-- group_id NULL = preset; created_by NULL = system.

insert into public.challenges (title, description, category, difficulty, xp_reward, proof_type) values
-- Habit (8)
('Drink 8 glasses of water', 'Hydrate, bestie. Snap a pic of your last glass to complete.', 'habit', 'easy', 30, 'photo'),
('Make your bed', 'Start the day with a win.', 'habit', 'easy', 20, 'honor'),
('No social media for 1 hour', 'Phone down. Brain on.', 'habit', 'medium', 40, 'honor'),
('Sleep by 11pm', 'Future-you says thanks.', 'habit', 'medium', 50, 'honor'),
('Meditate for 5 minutes', 'Just breathe.', 'habit', 'easy', 30, 'honor'),
('Take a cold shower', 'You will hate it. Do it anyway.', 'habit', 'hard', 70, 'photo'),
('Call a family member', 'They miss you.', 'habit', 'easy', 30, 'honor'),
('Write a gratitude journal entry', 'Three things you appreciated today.', 'habit', 'easy', 30, 'photo'),

-- Study (8)
('Read 20 pages', 'Of literally anything that is not a phone screen.', 'study', 'medium', 50, 'photo'),
('Study 30 min phone-free', 'Focus mode: engaged.', 'study', 'medium', 60, 'photo'),
('Learn 5 new words', 'Vocabulary unlock.', 'study', 'easy', 30, 'honor'),
('Watch an educational video', 'Anything 10+ min that taught you something.', 'study', 'easy', 30, 'honor'),
('Plan tomorrow tonight', 'Three things you will get done.', 'study', 'easy', 20, 'photo'),
('Organize your desk', 'Visible surface > invisible chaos.', 'study', 'easy', 30, 'photo'),
('Practice instrument for 15 min', 'Reps build skill.', 'study', 'medium', 50, 'honor'),
('Take detailed notes on a topic', 'Teach yourself via writing.', 'study', 'medium', 50, 'photo'),

-- Fitness (8)
('10 pushups', 'Wherever you are.', 'fitness', 'easy', 30, 'honor'),
('20 squats', 'Bodyweight is enough.', 'fitness', 'easy', 30, 'honor'),
('5K walk', 'Just go.', 'fitness', 'medium', 60, 'honor'),
('30-second plank', 'Core. Engaged.', 'fitness', 'easy', 30, 'honor'),
('50 jumping jacks', 'Cardio in your room.', 'fitness', 'easy', 30, 'honor'),
('15-min yoga session', 'Stretch the day off.', 'fitness', 'medium', 60, 'honor'),
('Hit 10,000 steps', 'Walking counts as cardio.', 'fitness', 'hard', 80, 'honor'),
('5-min full body stretch', 'Do not skip this.', 'fitness', 'easy', 20, 'honor'),

-- Dare (4)
('Compliment a stranger', 'Genuine. Specific. Watch them light up.', 'dare', 'medium', 50, 'honor'),
('Try a food you have never had', 'Be brave.', 'dare', 'medium', 50, 'photo'),
('Take a selfie at a place you have never been', 'Go somewhere new today.', 'dare', 'hard', 80, 'photo'),
('Ask politely for a discount somewhere', 'Worst case: they say no.', 'dare', 'hard', 70, 'honor'),

-- Creative (2)
('Sketch something for 10 minutes', 'Anything. Stick figures count.', 'creative', 'easy', 30, 'photo'),
('Write a haiku', '5-7-5. Boom. Done.', 'creative', 'easy', 30, 'photo');
