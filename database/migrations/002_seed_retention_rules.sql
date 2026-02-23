-- Ensure this migration writes timestamps in UTC.
SET time_zone = '+00:00';

-- Seed baseline retention rules
INSERT INTO retention_rules (id, name, table_name, timestamp_column, retention_days, enabled)
VALUES
    ('0f68e4fc-4f49-4c4b-9b9d-bec95e66f201', 'QR one-time tokens', 'qr_tokens', 'created_at', 30, TRUE),
    ('fe39d8bd-f214-45fd-8e0a-818f7da8fd66', 'Email verification tokens', 'email_tokens', 'expires_at', 30, TRUE),
    ('46b14d57-c95e-4c84-9fbe-14d617f62504', 'Revoked child device tokens', 'child_device_tokens', 'revoked_at', 365, TRUE)
ON DUPLICATE KEY UPDATE
    name = VALUES(name),
    retention_days = VALUES(retention_days),
    enabled = VALUES(enabled);

-- Seed baseline admin account identity.
-- Password hash is intentionally a placeholder here; backend startup seed logic
-- replaces it with a valid Argon2 hash for password: "admin".
INSERT INTO users (
    id,
    email,
    username,
    password_hash,
    role,
    language,
    is_verified,
    is_active,
    created_at,
    updated_at
)
VALUES (
    '8f8d5f66-5fc5-4f1b-b9f2-4d78fca4e663',
    'admin@admin.dk',
    'admin',
    'PLACEHOLDER',
    'admin',
    'en',
    TRUE,
    TRUE,
    UTC_TIMESTAMP(),
    UTC_TIMESTAMP()
)
ON DUPLICATE KEY UPDATE
    email = VALUES(email),
    username = VALUES(username),
    role = VALUES(role),
    language = VALUES(language),
    is_verified = VALUES(is_verified),
    is_active = VALUES(is_active),
    updated_at = UTC_TIMESTAMP();

-- Seed activity library (atomic reusable cards)
INSERT INTO visual_support_activity_library
    (id, owner_id, language, label_text, pictogram_id, category, priority_order, keyword_tags, arasaac_id, local_image_path, is_system)
VALUES
    ('a1000000-0000-4000-8000-000000000001', NULL, 'en', 'Wake up', '8988', 'daily_life', 10, JSON_ARRAY('wake','morning','start'), 8988, '/assets/pictograms/verb/8988.png', TRUE),
    ('a1000000-0000-4000-8000-000000000002', NULL, 'en', 'Get dressed', '2781', 'daily_life', 20, JSON_ARRAY('dress','clothes','routine'), 2781, '/assets/pictograms/verb/2781.png', TRUE),
    ('a1000000-0000-4000-8000-000000000003', NULL, 'en', 'Eat breakfast', '4625', 'daily_life', 30, JSON_ARRAY('breakfast','meal','food'), 4625, '/assets/pictograms/verb/4625.png', TRUE),
    ('a1000000-0000-4000-8000-000000000004', NULL, 'en', 'Brush teeth', '2326', 'daily_life', 40, JSON_ARRAY('teeth','hygiene','bathroom'), 2326, '/assets/pictograms/verb/2326.png', TRUE),
    ('a1000000-0000-4000-8000-000000000005', NULL, 'en', 'Put on shoes', '39546', 'daily_life', 50, JSON_ARRAY('shoes','outside','transition'), 39546, '/assets/pictograms/verb/39546.png', TRUE),
    ('a1000000-0000-4000-8000-000000000006', NULL, 'en', 'Go to school', '36473', 'school_routine', 60, JSON_ARRAY('school','travel','morning'), 36473, '/assets/pictograms/verb/36473.png', TRUE),
    ('a1000000-0000-4000-8000-000000000007', NULL, 'en', 'Leave classroom', '11748', 'school_routine', 70, JSON_ARRAY('classroom','transition','leave'), 11748, '/assets/pictograms/verb/11748.png', TRUE),
    ('a1000000-0000-4000-8000-000000000008', NULL, 'en', 'Enter transport', '36968', 'school_routine', 80, JSON_ARRAY('transport','bus','travel'), 36968, '/assets/pictograms/verb/36968.png', TRUE),
    ('a1000000-0000-4000-8000-000000000009', NULL, 'en', 'Travel home', '36655', 'school_routine', 90, JSON_ARRAY('home','transport','travel'), 36655, '/assets/pictograms/verb/36655.png', TRUE),
    ('a1000000-0000-4000-8000-000000000010', NULL, 'en', 'Hang up backpack', '10190', 'school_routine', 100, JSON_ARRAY('backpack','home','routine'), 10190, '/assets/pictograms/verb/10190.png', TRUE),
    ('a1000000-0000-4000-8000-000000000011', NULL, 'en', 'Snack time', '28414', 'daily_life', 110, JSON_ARRAY('snack','food','break'), 28414, '/assets/pictograms/verb/28414.png', TRUE),
    ('a1000000-0000-4000-8000-000000000012', NULL, 'en', 'Relax activity', '37721', 'behavior_support', 120, JSON_ARRAY('relax','calm','transition'), 37721, '/assets/pictograms/verb/37721.png', TRUE),
    ('a1000000-0000-4000-8000-000000000013', NULL, 'en', 'Story time', '4626', 'daily_life', 130, JSON_ARRAY('story','book','bedtime'), 4626, '/assets/pictograms/event/4626.png', TRUE),
    ('a1000000-0000-4000-8000-000000000014', NULL, 'en', 'Sleep', '32422', 'daily_life', 140, JSON_ARRAY('sleep','bedtime','night'), 32422, '/assets/pictograms/room/32422.png', TRUE)
ON DUPLICATE KEY UPDATE
    label_text = VALUES(label_text),
    pictogram_id = VALUES(pictogram_id),
    category = VALUES(category),
    priority_order = VALUES(priority_order),
    keyword_tags = VALUES(keyword_tags),
    arasaac_id = VALUES(arasaac_id),
    local_image_path = VALUES(local_image_path),
    is_system = VALUES(is_system),
    updated_at = UTC_TIMESTAMP();

-- Seed scenario templates (structure + metadata)
INSERT INTO visual_support_documents_templates
    (id, owner_id, name, description, document_type, scenario_type, language, is_system, metadata_json)
VALUES
    (
        '11111111-1111-4111-8111-111111111111',
        NULL,
        'Go to school',
        'Morning school transition with predictable ordered tasks.',
        'DAILY_SCHEDULE',
        'SCHOOL_ROUTINE',
        'en',
        TRUE,
        JSON_OBJECT('layout', JSON_OBJECT('slotCount', 6, 'columns', 1), 'print', JSON_OBJECT('format', 'A4'), 'supports', JSON_ARRAY('time_indicators', 'transport_icon', 'weather_icon'))
    ),
    (
        '22222222-2222-4222-8222-222222222222',
        NULL,
        'Come home from school',
        'After-school transition with comfort activity ending.',
        'DAILY_SCHEDULE',
        'SCHOOL_ROUTINE',
        'en',
        TRUE,
        JSON_OBJECT('layout', JSON_OBJECT('slotCount', 6, 'columns', 1), 'print', JSON_OBJECT('format', 'A4'), 'supports', JSON_ARRAY('transition_comfort_activity'))
    ),
    (
        '33333333-3333-4333-8333-333333333333',
        NULL,
        'Morning routine',
        'Simple high-predictability start of day routine.',
        'ROUTINE_STEPS',
        'DAILY_LIFE',
        'en',
        TRUE,
        JSON_OBJECT('layout', JSON_OBJECT('slotCount', 5, 'columns', 1), 'print', JSON_OBJECT('format', 'A4'), 'supports', JSON_ARRAY('checkbox_completion'))
    ),
    (
        '44444444-4444-4444-8444-444444444444',
        NULL,
        'Bedtime routine',
        'Low-stimulation evening wind-down sequence.',
        'ROUTINE_STEPS',
        'DAILY_LIFE',
        'en',
        TRUE,
        JSON_OBJECT('layout', JSON_OBJECT('slotCount', 6, 'columns', 1), 'print', JSON_OBJECT('format', 'A4'), 'supports', JSON_ARRAY('calm_tone'))
    ),
    (
        '55555555-5555-4555-8555-555555555555',
        NULL,
        'School week overview',
        'Stable weekly school structure with predictable day columns.',
        'WEEKLY_SCHEDULE',
        'SCHOOL_ROUTINE',
        'en',
        TRUE,
        JSON_OBJECT('layout', JSON_OBJECT('slotCount', 5, 'columns', 5), 'print', JSON_OBJECT('format', 'A4', 'orientation', 'landscape'), 'supports', JSON_ARRAY('weekday_headers'))
    ),
    (
        '66666666-6666-4666-8666-666666666666',
        NULL,
        'First then transition',
        'Two-step transition support for cognitive safety.',
        'FIRST_THEN',
        'BEHAVIOR_SUPPORT',
        'en',
        TRUE,
        JSON_OBJECT('layout', JSON_OBJECT('slotCount', 2, 'columns', 2), 'print', JSON_OBJECT('format', 'A4'), 'supports', JSON_ARRAY('clear_start_end_markers'))
    ),
    (
        '77777777-7777-4777-8777-777777777777',
        NULL,
        'Snack choice board',
        'Simple limited-option decision support.',
        'CHOICE_BOARD',
        'DAILY_LIFE',
        'en',
        TRUE,
        JSON_OBJECT('layout', JSON_OBJECT('slotCount', 4, 'columns', 2), 'print', JSON_OBJECT('format', 'A4'), 'supports', JSON_ARRAY('limited_choices'))
    ),
    (
        '88888888-8888-4888-8888-888888888888',
        NULL,
        'Emotion starter cards',
        'Core emotion set for communication and co-regulation.',
        'EMOTION_CARDS',
        'SOCIAL_EMOTIONAL',
        'en',
        TRUE,
        JSON_OBJECT('layout', JSON_OBJECT('slotCount', 5, 'columns', 3), 'print', JSON_OBJECT('format', 'A4'), 'supports', JSON_ARRAY('high_contrast_labels'))
    ),
    (
        '99999999-9999-4999-8999-999999999999',
        NULL,
        'Core AAC board',
        'Core communication board with fixed symbol positions.',
        'AAC_BOARD',
        'COMMUNICATION',
        'en',
        TRUE,
        JSON_OBJECT('layout', JSON_OBJECT('slotCount', 8, 'columns', 4), 'print', JSON_OBJECT('format', 'A4'), 'supports', JSON_ARRAY('fixed_positions'))
    ),
    (
        'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
        NULL,
        'Five step reward tracker',
        'Linear positive reinforcement progression.',
        'REWARD_TRACKER',
        'BEHAVIOR_SUPPORT',
        'en',
        TRUE,
        JSON_OBJECT('layout', JSON_OBJECT('slotCount', 5, 'columns', 5), 'print', JSON_OBJECT('format', 'A4'), 'supports', JSON_ARRAY('clear_reward_endpoint'))
    )
ON DUPLICATE KEY UPDATE
    name = VALUES(name),
    description = VALUES(description),
    scenario_type = VALUES(scenario_type),
    language = VALUES(language),
    is_system = VALUES(is_system),
    metadata_json = VALUES(metadata_json),
    updated_at = UTC_TIMESTAMP();

-- Seed ordered activity slots for scenario templates
INSERT INTO visual_support_template_activities
    (id, template_id, activity_order, activity_card_id, pictogram_id, text_label, optional_notes, metadata_json)
VALUES
    ('b1000000-0000-4000-8000-000000000001', '11111111-1111-4111-8111-111111111111', 1, 'a1000000-0000-4000-8000-000000000001', NULL, 'Wake up', NULL, NULL),
    ('b1000000-0000-4000-8000-000000000002', '11111111-1111-4111-8111-111111111111', 2, 'a1000000-0000-4000-8000-000000000002', NULL, 'Get dressed', NULL, NULL),
    ('b1000000-0000-4000-8000-000000000003', '11111111-1111-4111-8111-111111111111', 3, 'a1000000-0000-4000-8000-000000000003', NULL, 'Eat breakfast', NULL, NULL),
    ('b1000000-0000-4000-8000-000000000004', '11111111-1111-4111-8111-111111111111', 4, 'a1000000-0000-4000-8000-000000000004', NULL, 'Brush teeth', NULL, NULL),
    ('b1000000-0000-4000-8000-000000000005', '11111111-1111-4111-8111-111111111111', 5, 'a1000000-0000-4000-8000-000000000005', NULL, 'Put on shoes', NULL, NULL),
    ('b1000000-0000-4000-8000-000000000006', '11111111-1111-4111-8111-111111111111', 6, 'a1000000-0000-4000-8000-000000000006', NULL, 'Go to school', NULL, NULL),

    ('b1000000-0000-4000-8000-000000000007', '22222222-2222-4222-8222-222222222222', 1, 'a1000000-0000-4000-8000-000000000007', NULL, 'Leave classroom', NULL, NULL),
    ('b1000000-0000-4000-8000-000000000008', '22222222-2222-4222-8222-222222222222', 2, 'a1000000-0000-4000-8000-000000000008', NULL, 'Enter transport', NULL, NULL),
    ('b1000000-0000-4000-8000-000000000009', '22222222-2222-4222-8222-222222222222', 3, 'a1000000-0000-4000-8000-000000000009', NULL, 'Travel home', NULL, NULL),
    ('b1000000-0000-4000-8000-000000000010', '22222222-2222-4222-8222-222222222222', 4, 'a1000000-0000-4000-8000-000000000010', NULL, 'Hang up backpack', NULL, NULL),
    ('b1000000-0000-4000-8000-000000000011', '22222222-2222-4222-8222-222222222222', 5, 'a1000000-0000-4000-8000-000000000011', NULL, 'Snack time', NULL, NULL),
    ('b1000000-0000-4000-8000-000000000012', '22222222-2222-4222-8222-222222222222', 6, 'a1000000-0000-4000-8000-000000000012', NULL, 'Relax activity', 'Transition comfort activity', NULL),

    ('b1000000-0000-4000-8000-000000000013', '33333333-3333-4333-8333-333333333333', 1, 'a1000000-0000-4000-8000-000000000001', NULL, 'Wake up', NULL, NULL),
    ('b1000000-0000-4000-8000-000000000014', '33333333-3333-4333-8333-333333333333', 2, NULL, 'bathroom', 'Bathroom', NULL, NULL),
    ('b1000000-0000-4000-8000-000000000015', '33333333-3333-4333-8333-333333333333', 3, NULL, 'wash_face', 'Wash face', NULL, NULL),
    ('b1000000-0000-4000-8000-000000000016', '33333333-3333-4333-8333-333333333333', 4, 'a1000000-0000-4000-8000-000000000002', NULL, 'Dress', NULL, NULL),
    ('b1000000-0000-4000-8000-000000000017', '33333333-3333-4333-8333-333333333333', 5, 'a1000000-0000-4000-8000-000000000003', NULL, 'Breakfast', NULL, NULL),

    ('b1000000-0000-4000-8000-000000000018', '44444444-4444-4444-8444-444444444444', 1, NULL, 'put_away_toys', 'Put away toys', NULL, NULL),
    ('b1000000-0000-4000-8000-000000000019', '44444444-4444-4444-8444-444444444444', 2, NULL, 'bath_shower', 'Bath / shower', NULL, NULL),
    ('b1000000-0000-4000-8000-000000000020', '44444444-4444-4444-8444-444444444444', 3, NULL, 'pajamas', 'Pajamas', NULL, NULL),
    ('b1000000-0000-4000-8000-000000000021', '44444444-4444-4444-8444-444444444444', 4, 'a1000000-0000-4000-8000-000000000004', NULL, 'Teeth brushing', NULL, NULL),
    ('b1000000-0000-4000-8000-000000000022', '44444444-4444-4444-8444-444444444444', 5, 'a1000000-0000-4000-8000-000000000013', NULL, 'Story time', NULL, NULL),
    ('b1000000-0000-4000-8000-000000000023', '44444444-4444-4444-8444-444444444444', 6, 'a1000000-0000-4000-8000-000000000014', NULL, 'Sleep', NULL, NULL),

    ('b1000000-0000-4000-8000-000000000024', '55555555-5555-4555-8555-555555555555', 1, NULL, 'monday_school', 'Monday', NULL, NULL),
    ('b1000000-0000-4000-8000-000000000025', '55555555-5555-4555-8555-555555555555', 2, NULL, 'tuesday_school', 'Tuesday', NULL, NULL),
    ('b1000000-0000-4000-8000-000000000026', '55555555-5555-4555-8555-555555555555', 3, NULL, 'wednesday_school', 'Wednesday', NULL, NULL),
    ('b1000000-0000-4000-8000-000000000027', '55555555-5555-4555-8555-555555555555', 4, NULL, 'thursday_school', 'Thursday', NULL, NULL),
    ('b1000000-0000-4000-8000-000000000028', '55555555-5555-4555-8555-555555555555', 5, NULL, 'friday_school', 'Friday', NULL, NULL),

    ('b1000000-0000-4000-8000-000000000029', '66666666-6666-4666-8666-666666666666', 1, NULL, 'first_task', 'First', 'Preferred low-friction starter', NULL),
    ('b1000000-0000-4000-8000-000000000030', '66666666-6666-4666-8666-666666666666', 2, NULL, 'then_task', 'Then', 'Reward or desired follow-up activity', NULL),

    ('b1000000-0000-4000-8000-000000000031', '77777777-7777-4777-8777-777777777777', 1, NULL, 'snack_choice_1', 'Fruit', NULL, NULL),
    ('b1000000-0000-4000-8000-000000000032', '77777777-7777-4777-8777-777777777777', 2, NULL, 'snack_choice_2', 'Yogurt', NULL, NULL),
    ('b1000000-0000-4000-8000-000000000033', '77777777-7777-4777-8777-777777777777', 3, NULL, 'snack_choice_3', 'Crackers', NULL, NULL),
    ('b1000000-0000-4000-8000-000000000034', '77777777-7777-4777-8777-777777777777', 4, NULL, 'snack_choice_4', 'Water', NULL, NULL),

    ('b1000000-0000-4000-8000-000000000035', '88888888-8888-4888-8888-888888888888', 1, NULL, 'emotion_happy', 'Happy', NULL, NULL),
    ('b1000000-0000-4000-8000-000000000036', '88888888-8888-4888-8888-888888888888', 2, NULL, 'emotion_sad', 'Sad', NULL, NULL),
    ('b1000000-0000-4000-8000-000000000037', '88888888-8888-4888-8888-888888888888', 3, NULL, 'emotion_angry', 'Angry', NULL, NULL),
    ('b1000000-0000-4000-8000-000000000038', '88888888-8888-4888-8888-888888888888', 4, NULL, 'emotion_scared', 'Scared', NULL, NULL),
    ('b1000000-0000-4000-8000-000000000039', '88888888-8888-4888-8888-888888888888', 5, NULL, 'emotion_calm', 'Calm', NULL, NULL),

    ('b1000000-0000-4000-8000-000000000040', '99999999-9999-4999-8999-999999999999', 1, NULL, 'aac_more', 'More', NULL, NULL),
    ('b1000000-0000-4000-8000-000000000041', '99999999-9999-4999-8999-999999999999', 2, NULL, 'aac_stop', 'Stop', NULL, NULL),
    ('b1000000-0000-4000-8000-000000000042', '99999999-9999-4999-8999-999999999999', 3, NULL, 'aac_help', 'Help', NULL, NULL),
    ('b1000000-0000-4000-8000-000000000043', '99999999-9999-4999-8999-999999999999', 4, NULL, 'aac_toilet', 'Toilet', NULL, NULL),
    ('b1000000-0000-4000-8000-000000000044', '99999999-9999-4999-8999-999999999999', 5, NULL, 'aac_eat', 'Eat', NULL, NULL),
    ('b1000000-0000-4000-8000-000000000045', '99999999-9999-4999-8999-999999999999', 6, NULL, 'aac_drink', 'Drink', NULL, NULL),
    ('b1000000-0000-4000-8000-000000000046', '99999999-9999-4999-8999-999999999999', 7, NULL, 'aac_home', 'Home', NULL, NULL),
    ('b1000000-0000-4000-8000-000000000047', '99999999-9999-4999-8999-999999999999', 8, NULL, 'aac_school', 'School', NULL, NULL),

    ('b1000000-0000-4000-8000-000000000048', 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 1, NULL, 'reward_slot_1', 'Step 1', NULL, NULL),
    ('b1000000-0000-4000-8000-000000000049', 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 2, NULL, 'reward_slot_2', 'Step 2', NULL, NULL),
    ('b1000000-0000-4000-8000-000000000050', 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 3, NULL, 'reward_slot_3', 'Step 3', NULL, NULL),
    ('b1000000-0000-4000-8000-000000000051', 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 4, NULL, 'reward_slot_4', 'Step 4', NULL, NULL),
    ('b1000000-0000-4000-8000-000000000052', 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 5, NULL, 'reward_slot_5', 'Reward', 'Clear endpoint marker', NULL)
ON DUPLICATE KEY UPDATE
    activity_order = VALUES(activity_order),
    activity_card_id = VALUES(activity_card_id),
    pictogram_id = VALUES(pictogram_id),
    text_label = VALUES(text_label),
    optional_notes = VALUES(optional_notes),
    metadata_json = VALUES(metadata_json),
    updated_at = UTC_TIMESTAMP();
