-- Seed additional First/Then system templates with pictogram-backed activities.
SET time_zone = '+00:00';

-- Activity cards used by new First/Then templates.
INSERT INTO visual_support_activity_library
	(id, owner_id, language, label_text, pictogram_id, category, priority_order, keyword_tags, arasaac_id, local_image_path, is_system)
VALUES
	('a2000000-0000-4000-8000-000000000001', NULL, 'en', 'Brush teeth', '2326', 'routine', 210, JSON_ARRAY('hygiene', 'teeth', 'routine'), 2326, '/assets/pictograms/verb/2326.png', TRUE),
	('a2000000-0000-4000-8000-000000000002', NULL, 'en', 'Tablet time', '28099', 'reward', 220, JSON_ARRAY('tablet', 'device', 'reward'), 28099, '/assets/pictograms/object/28099.png', TRUE),
	('a2000000-0000-4000-8000-000000000003', NULL, 'en', 'Get dressed', '6627', 'routine', 230, JSON_ARRAY('dress', 'clothes', 'routine'), 6627, '/assets/pictograms/verb/6627.png', TRUE),
	('a2000000-0000-4000-8000-000000000004', NULL, 'en', 'Breakfast', '4626', 'daily_life', 240, JSON_ARRAY('breakfast', 'food', 'meal'), 4626, '/assets/pictograms/event/4626.png', TRUE),
	('a2000000-0000-4000-8000-000000000005', NULL, 'en', 'Homework', '11228', 'school_routine', 250, JSON_ARRAY('school', 'homework', 'task'), 11228, '/assets/pictograms/education/11228.png', TRUE),
	('a2000000-0000-4000-8000-000000000006', NULL, 'en', 'Playground', '33064', 'reward', 260, JSON_ARRAY('play', 'outside', 'reward'), 33064, '/assets/pictograms/place/33064.png', TRUE),
	('a2000000-0000-4000-8000-000000000007', NULL, 'en', 'Clean up', '16803', 'routine', 270, JSON_ARRAY('clean', 'tidy', 'chores'), 16803, '/assets/pictograms/verb/16803.png', TRUE),
	('a2000000-0000-4000-8000-000000000008', NULL, 'en', 'Snack', '4695', 'reward', 280, JSON_ARRAY('snack', 'food', 'break'), 4695, '/assets/pictograms/event/4695.png', TRUE),
	('a2000000-0000-4000-8000-000000000009', NULL, 'en', 'Put on shoes', '14534', 'routine', 290, JSON_ARRAY('shoes', 'outside', 'transition'), 14534, '/assets/pictograms/verb/14534.png', TRUE)
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

-- Five new First/Then templates.
INSERT INTO visual_support_documents_templates
	(id, owner_id, name, description, document_type, scenario_type, language, is_system, metadata_json)
VALUES
	(
		'f1a00000-0000-4000-8000-000000000001',
		NULL,
		'First then: Brush teeth → Tablet time',
		'Premack-style transition: complete hygiene first, then preferred tablet activity.',
		'FIRST_THEN',
		'BEHAVIOR_SUPPORT',
		'en',
		TRUE,
		JSON_OBJECT('layout', JSON_OBJECT('slotCount', 2, 'columns', 2), 'print', JSON_OBJECT('format', 'A4'), 'supports', JSON_ARRAY('premack_principle', 'clear_transition'))
	),
	(
		'f1a00000-0000-4000-8000-000000000002',
		NULL,
		'First then: Get dressed → Breakfast',
		'Morning routine support with predictable first task and immediate daily reward.',
		'FIRST_THEN',
		'BEHAVIOR_SUPPORT',
		'en',
		TRUE,
		JSON_OBJECT('layout', JSON_OBJECT('slotCount', 2, 'columns', 2), 'print', JSON_OBJECT('format', 'A4'), 'supports', JSON_ARRAY('morning_transition', 'predictable_sequence'))
	),
	(
		'f1a00000-0000-4000-8000-000000000003',
		NULL,
		'First then: Homework → Playground',
		'After-school support: complete homework before outdoor play.',
		'FIRST_THEN',
		'BEHAVIOR_SUPPORT',
		'en',
		TRUE,
		JSON_OBJECT('layout', JSON_OBJECT('slotCount', 2, 'columns', 2), 'print', JSON_OBJECT('format', 'A4'), 'supports', JSON_ARRAY('homework_transition', 'motivation_support'))
	),
	(
		'f1a00000-0000-4000-8000-000000000004',
		NULL,
		'First then: Clean up → Snack',
		'Task completion support for tidy-up routines followed by snack.',
		'FIRST_THEN',
		'BEHAVIOR_SUPPORT',
		'en',
		TRUE,
		JSON_OBJECT('layout', JSON_OBJECT('slotCount', 2, 'columns', 2), 'print', JSON_OBJECT('format', 'A4'), 'supports', JSON_ARRAY('cleanup_transition', 'positive_reinforcement'))
	),
	(
		'f1a00000-0000-4000-8000-000000000005',
		NULL,
		'First then: Put on shoes → Playground',
		'Exit transition support: get ready to go out, then play outside.',
		'FIRST_THEN',
		'BEHAVIOR_SUPPORT',
		'en',
		TRUE,
		JSON_OBJECT('layout', JSON_OBJECT('slotCount', 2, 'columns', 2), 'print', JSON_OBJECT('format', 'A4'), 'supports', JSON_ARRAY('exit_transition', 'outdoor_motivation'))
	)
ON DUPLICATE KEY UPDATE
	name = VALUES(name),
	description = VALUES(description),
	scenario_type = VALUES(scenario_type),
	language = VALUES(language),
	is_system = VALUES(is_system),
	metadata_json = VALUES(metadata_json),
	updated_at = UTC_TIMESTAMP();

-- Ordered slots for each new First/Then template.
INSERT INTO visual_support_template_activities
	(id, template_id, activity_order, activity_card_id, pictogram_id, text_label, optional_notes, metadata_json)
VALUES
	('b2000000-0000-4000-8000-000000000001', 'f1a00000-0000-4000-8000-000000000001', 1, 'a2000000-0000-4000-8000-000000000001', NULL, 'Brush teeth', 'First task', NULL),
	('b2000000-0000-4000-8000-000000000002', 'f1a00000-0000-4000-8000-000000000001', 2, 'a2000000-0000-4000-8000-000000000002', NULL, 'Tablet time', 'Then reward', NULL),

	('b2000000-0000-4000-8000-000000000003', 'f1a00000-0000-4000-8000-000000000002', 1, 'a2000000-0000-4000-8000-000000000003', NULL, 'Get dressed', 'First task', NULL),
	('b2000000-0000-4000-8000-000000000004', 'f1a00000-0000-4000-8000-000000000002', 2, 'a2000000-0000-4000-8000-000000000004', NULL, 'Breakfast', 'Then reward', NULL),

	('b2000000-0000-4000-8000-000000000005', 'f1a00000-0000-4000-8000-000000000003', 1, 'a2000000-0000-4000-8000-000000000005', NULL, 'Homework', 'First task', NULL),
	('b2000000-0000-4000-8000-000000000006', 'f1a00000-0000-4000-8000-000000000003', 2, 'a2000000-0000-4000-8000-000000000006', NULL, 'Playground', 'Then reward', NULL),

	('b2000000-0000-4000-8000-000000000007', 'f1a00000-0000-4000-8000-000000000004', 1, 'a2000000-0000-4000-8000-000000000007', NULL, 'Clean up', 'First task', NULL),
	('b2000000-0000-4000-8000-000000000008', 'f1a00000-0000-4000-8000-000000000004', 2, 'a2000000-0000-4000-8000-000000000008', NULL, 'Snack', 'Then reward', NULL),

	('b2000000-0000-4000-8000-000000000009', 'f1a00000-0000-4000-8000-000000000005', 1, 'a2000000-0000-4000-8000-000000000009', NULL, 'Put on shoes', 'First task', NULL),
	('b2000000-0000-4000-8000-000000000010', 'f1a00000-0000-4000-8000-000000000005', 2, 'a2000000-0000-4000-8000-000000000006', NULL, 'Playground', 'Then reward', NULL)
ON DUPLICATE KEY UPDATE
	activity_order = VALUES(activity_order),
	activity_card_id = VALUES(activity_card_id),
	pictogram_id = VALUES(pictogram_id),
	text_label = VALUES(text_label),
	optional_notes = VALUES(optional_notes),
	metadata_json = VALUES(metadata_json),
	updated_at = UTC_TIMESTAMP();
