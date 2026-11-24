-- 業種カテゴリを事例一括登録シート「選択肢」の8大分類・中分類に合わせる。
-- 既存の大分類（同名）はそのまま使い、足りない分類だけ追加する。シートに無い仮の分類は、商材で使われていなければ非表示にする（削除はしない）。

INSERT INTO categories (id, parent_id, name, sort_order, is_active, created_at, updated_at)
SELECT 'sheet-p0', NULL, '美容・コスメ', 0, 1, strftime('%Y-%m-%dT%H:%M:%fZ','now'), strftime('%Y-%m-%dT%H:%M:%fZ','now')
WHERE NOT EXISTS (SELECT 1 FROM categories WHERE parent_id IS NULL AND name = '美容・コスメ');
UPDATE categories SET is_active = 1, sort_order = 0 WHERE parent_id IS NULL AND name = '美容・コスメ';
INSERT INTO categories (id, parent_id, name, sort_order, is_active, created_at, updated_at)
SELECT 'sheet-p0-c0', (SELECT id FROM categories WHERE parent_id IS NULL AND name = '美容・コスメ'), 'スキンケア', 0, 1, strftime('%Y-%m-%dT%H:%M:%fZ','now'), strftime('%Y-%m-%dT%H:%M:%fZ','now')
WHERE NOT EXISTS (SELECT 1 FROM categories WHERE parent_id = (SELECT id FROM categories WHERE parent_id IS NULL AND name = '美容・コスメ') AND name = 'スキンケア');
UPDATE categories SET is_active = 1, sort_order = 0 WHERE parent_id = (SELECT id FROM categories WHERE parent_id IS NULL AND name = '美容・コスメ') AND name = 'スキンケア';
INSERT INTO categories (id, parent_id, name, sort_order, is_active, created_at, updated_at)
SELECT 'sheet-p0-c1', (SELECT id FROM categories WHERE parent_id IS NULL AND name = '美容・コスメ'), 'エイジングケア', 1, 1, strftime('%Y-%m-%dT%H:%M:%fZ','now'), strftime('%Y-%m-%dT%H:%M:%fZ','now')
WHERE NOT EXISTS (SELECT 1 FROM categories WHERE parent_id = (SELECT id FROM categories WHERE parent_id IS NULL AND name = '美容・コスメ') AND name = 'エイジングケア');
UPDATE categories SET is_active = 1, sort_order = 1 WHERE parent_id = (SELECT id FROM categories WHERE parent_id IS NULL AND name = '美容・コスメ') AND name = 'エイジングケア';
INSERT INTO categories (id, parent_id, name, sort_order, is_active, created_at, updated_at)
SELECT 'sheet-p0-c2', (SELECT id FROM categories WHERE parent_id IS NULL AND name = '美容・コスメ'), 'ヘアケア', 2, 1, strftime('%Y-%m-%dT%H:%M:%fZ','now'), strftime('%Y-%m-%dT%H:%M:%fZ','now')
WHERE NOT EXISTS (SELECT 1 FROM categories WHERE parent_id = (SELECT id FROM categories WHERE parent_id IS NULL AND name = '美容・コスメ') AND name = 'ヘアケア');
UPDATE categories SET is_active = 1, sort_order = 2 WHERE parent_id = (SELECT id FROM categories WHERE parent_id IS NULL AND name = '美容・コスメ') AND name = 'ヘアケア';
INSERT INTO categories (id, parent_id, name, sort_order, is_active, created_at, updated_at)
SELECT 'sheet-p0-c3', (SELECT id FROM categories WHERE parent_id IS NULL AND name = '美容・コスメ'), 'メイク', 3, 1, strftime('%Y-%m-%dT%H:%M:%fZ','now'), strftime('%Y-%m-%dT%H:%M:%fZ','now')
WHERE NOT EXISTS (SELECT 1 FROM categories WHERE parent_id = (SELECT id FROM categories WHERE parent_id IS NULL AND name = '美容・コスメ') AND name = 'メイク');
UPDATE categories SET is_active = 1, sort_order = 3 WHERE parent_id = (SELECT id FROM categories WHERE parent_id IS NULL AND name = '美容・コスメ') AND name = 'メイク';
INSERT INTO categories (id, parent_id, name, sort_order, is_active, created_at, updated_at)
SELECT 'sheet-p0-c4', (SELECT id FROM categories WHERE parent_id IS NULL AND name = '美容・コスメ'), 'ボディケア', 4, 1, strftime('%Y-%m-%dT%H:%M:%fZ','now'), strftime('%Y-%m-%dT%H:%M:%fZ','now')
WHERE NOT EXISTS (SELECT 1 FROM categories WHERE parent_id = (SELECT id FROM categories WHERE parent_id IS NULL AND name = '美容・コスメ') AND name = 'ボディケア');
UPDATE categories SET is_active = 1, sort_order = 4 WHERE parent_id = (SELECT id FROM categories WHERE parent_id IS NULL AND name = '美容・コスメ') AND name = 'ボディケア';
INSERT INTO categories (id, parent_id, name, sort_order, is_active, created_at, updated_at)
SELECT 'sheet-p1', NULL, '健康食品・サプリ', 1, 1, strftime('%Y-%m-%dT%H:%M:%fZ','now'), strftime('%Y-%m-%dT%H:%M:%fZ','now')
WHERE NOT EXISTS (SELECT 1 FROM categories WHERE parent_id IS NULL AND name = '健康食品・サプリ');
UPDATE categories SET is_active = 1, sort_order = 1 WHERE parent_id IS NULL AND name = '健康食品・サプリ';
INSERT INTO categories (id, parent_id, name, sort_order, is_active, created_at, updated_at)
SELECT 'sheet-p1-c0', (SELECT id FROM categories WHERE parent_id IS NULL AND name = '健康食品・サプリ'), 'ダイエット', 0, 1, strftime('%Y-%m-%dT%H:%M:%fZ','now'), strftime('%Y-%m-%dT%H:%M:%fZ','now')
WHERE NOT EXISTS (SELECT 1 FROM categories WHERE parent_id = (SELECT id FROM categories WHERE parent_id IS NULL AND name = '健康食品・サプリ') AND name = 'ダイエット');
UPDATE categories SET is_active = 1, sort_order = 0 WHERE parent_id = (SELECT id FROM categories WHERE parent_id IS NULL AND name = '健康食品・サプリ') AND name = 'ダイエット';
INSERT INTO categories (id, parent_id, name, sort_order, is_active, created_at, updated_at)
SELECT 'sheet-p1-c1', (SELECT id FROM categories WHERE parent_id IS NULL AND name = '健康食品・サプリ'), '腸活', 1, 1, strftime('%Y-%m-%dT%H:%M:%fZ','now'), strftime('%Y-%m-%dT%H:%M:%fZ','now')
WHERE NOT EXISTS (SELECT 1 FROM categories WHERE parent_id = (SELECT id FROM categories WHERE parent_id IS NULL AND name = '健康食品・サプリ') AND name = '腸活');
UPDATE categories SET is_active = 1, sort_order = 1 WHERE parent_id = (SELECT id FROM categories WHERE parent_id IS NULL AND name = '健康食品・サプリ') AND name = '腸活';
INSERT INTO categories (id, parent_id, name, sort_order, is_active, created_at, updated_at)
SELECT 'sheet-p1-c2', (SELECT id FROM categories WHERE parent_id IS NULL AND name = '健康食品・サプリ'), '睡眠', 2, 1, strftime('%Y-%m-%dT%H:%M:%fZ','now'), strftime('%Y-%m-%dT%H:%M:%fZ','now')
WHERE NOT EXISTS (SELECT 1 FROM categories WHERE parent_id = (SELECT id FROM categories WHERE parent_id IS NULL AND name = '健康食品・サプリ') AND name = '睡眠');
UPDATE categories SET is_active = 1, sort_order = 2 WHERE parent_id = (SELECT id FROM categories WHERE parent_id IS NULL AND name = '健康食品・サプリ') AND name = '睡眠';
INSERT INTO categories (id, parent_id, name, sort_order, is_active, created_at, updated_at)
SELECT 'sheet-p1-c3', (SELECT id FROM categories WHERE parent_id IS NULL AND name = '健康食品・サプリ'), '関節', 3, 1, strftime('%Y-%m-%dT%H:%M:%fZ','now'), strftime('%Y-%m-%dT%H:%M:%fZ','now')
WHERE NOT EXISTS (SELECT 1 FROM categories WHERE parent_id = (SELECT id FROM categories WHERE parent_id IS NULL AND name = '健康食品・サプリ') AND name = '関節');
UPDATE categories SET is_active = 1, sort_order = 3 WHERE parent_id = (SELECT id FROM categories WHERE parent_id IS NULL AND name = '健康食品・サプリ') AND name = '関節';
INSERT INTO categories (id, parent_id, name, sort_order, is_active, created_at, updated_at)
SELECT 'sheet-p1-c4', (SELECT id FROM categories WHERE parent_id IS NULL AND name = '健康食品・サプリ'), '青汁・栄養補助', 4, 1, strftime('%Y-%m-%dT%H:%M:%fZ','now'), strftime('%Y-%m-%dT%H:%M:%fZ','now')
WHERE NOT EXISTS (SELECT 1 FROM categories WHERE parent_id = (SELECT id FROM categories WHERE parent_id IS NULL AND name = '健康食品・サプリ') AND name = '青汁・栄養補助');
UPDATE categories SET is_active = 1, sort_order = 4 WHERE parent_id = (SELECT id FROM categories WHERE parent_id IS NULL AND name = '健康食品・サプリ') AND name = '青汁・栄養補助';
INSERT INTO categories (id, parent_id, name, sort_order, is_active, created_at, updated_at)
SELECT 'sheet-p2', NULL, '美容医療・クリニック', 2, 1, strftime('%Y-%m-%dT%H:%M:%fZ','now'), strftime('%Y-%m-%dT%H:%M:%fZ','now')
WHERE NOT EXISTS (SELECT 1 FROM categories WHERE parent_id IS NULL AND name = '美容医療・クリニック');
UPDATE categories SET is_active = 1, sort_order = 2 WHERE parent_id IS NULL AND name = '美容医療・クリニック';
INSERT INTO categories (id, parent_id, name, sort_order, is_active, created_at, updated_at)
SELECT 'sheet-p2-c0', (SELECT id FROM categories WHERE parent_id IS NULL AND name = '美容医療・クリニック'), '医療脱毛', 0, 1, strftime('%Y-%m-%dT%H:%M:%fZ','now'), strftime('%Y-%m-%dT%H:%M:%fZ','now')
WHERE NOT EXISTS (SELECT 1 FROM categories WHERE parent_id = (SELECT id FROM categories WHERE parent_id IS NULL AND name = '美容医療・クリニック') AND name = '医療脱毛');
UPDATE categories SET is_active = 1, sort_order = 0 WHERE parent_id = (SELECT id FROM categories WHERE parent_id IS NULL AND name = '美容医療・クリニック') AND name = '医療脱毛';
INSERT INTO categories (id, parent_id, name, sort_order, is_active, created_at, updated_at)
SELECT 'sheet-p2-c1', (SELECT id FROM categories WHERE parent_id IS NULL AND name = '美容医療・クリニック'), 'AGA・薄毛', 1, 1, strftime('%Y-%m-%dT%H:%M:%fZ','now'), strftime('%Y-%m-%dT%H:%M:%fZ','now')
WHERE NOT EXISTS (SELECT 1 FROM categories WHERE parent_id = (SELECT id FROM categories WHERE parent_id IS NULL AND name = '美容医療・クリニック') AND name = 'AGA・薄毛');
UPDATE categories SET is_active = 1, sort_order = 1 WHERE parent_id = (SELECT id FROM categories WHERE parent_id IS NULL AND name = '美容医療・クリニック') AND name = 'AGA・薄毛';
INSERT INTO categories (id, parent_id, name, sort_order, is_active, created_at, updated_at)
SELECT 'sheet-p2-c2', (SELECT id FROM categories WHERE parent_id IS NULL AND name = '美容医療・クリニック'), '美容皮膚科', 2, 1, strftime('%Y-%m-%dT%H:%M:%fZ','now'), strftime('%Y-%m-%dT%H:%M:%fZ','now')
WHERE NOT EXISTS (SELECT 1 FROM categories WHERE parent_id = (SELECT id FROM categories WHERE parent_id IS NULL AND name = '美容医療・クリニック') AND name = '美容皮膚科');
UPDATE categories SET is_active = 1, sort_order = 2 WHERE parent_id = (SELECT id FROM categories WHERE parent_id IS NULL AND name = '美容医療・クリニック') AND name = '美容皮膚科';
INSERT INTO categories (id, parent_id, name, sort_order, is_active, created_at, updated_at)
SELECT 'sheet-p2-c3', (SELECT id FROM categories WHERE parent_id IS NULL AND name = '美容医療・クリニック'), '歯科矯正', 3, 1, strftime('%Y-%m-%dT%H:%M:%fZ','now'), strftime('%Y-%m-%dT%H:%M:%fZ','now')
WHERE NOT EXISTS (SELECT 1 FROM categories WHERE parent_id = (SELECT id FROM categories WHERE parent_id IS NULL AND name = '美容医療・クリニック') AND name = '歯科矯正');
UPDATE categories SET is_active = 1, sort_order = 3 WHERE parent_id = (SELECT id FROM categories WHERE parent_id IS NULL AND name = '美容医療・クリニック') AND name = '歯科矯正';
INSERT INTO categories (id, parent_id, name, sort_order, is_active, created_at, updated_at)
SELECT 'sheet-p3', NULL, 'サロン・スクール', 3, 1, strftime('%Y-%m-%dT%H:%M:%fZ','now'), strftime('%Y-%m-%dT%H:%M:%fZ','now')
WHERE NOT EXISTS (SELECT 1 FROM categories WHERE parent_id IS NULL AND name = 'サロン・スクール');
UPDATE categories SET is_active = 1, sort_order = 3 WHERE parent_id IS NULL AND name = 'サロン・スクール';
INSERT INTO categories (id, parent_id, name, sort_order, is_active, created_at, updated_at)
SELECT 'sheet-p3-c0', (SELECT id FROM categories WHERE parent_id IS NULL AND name = 'サロン・スクール'), 'エステ・脱毛サロン', 0, 1, strftime('%Y-%m-%dT%H:%M:%fZ','now'), strftime('%Y-%m-%dT%H:%M:%fZ','now')
WHERE NOT EXISTS (SELECT 1 FROM categories WHERE parent_id = (SELECT id FROM categories WHERE parent_id IS NULL AND name = 'サロン・スクール') AND name = 'エステ・脱毛サロン');
UPDATE categories SET is_active = 1, sort_order = 0 WHERE parent_id = (SELECT id FROM categories WHERE parent_id IS NULL AND name = 'サロン・スクール') AND name = 'エステ・脱毛サロン';
INSERT INTO categories (id, parent_id, name, sort_order, is_active, created_at, updated_at)
SELECT 'sheet-p3-c1', (SELECT id FROM categories WHERE parent_id IS NULL AND name = 'サロン・スクール'), 'パーソナルジム', 1, 1, strftime('%Y-%m-%dT%H:%M:%fZ','now'), strftime('%Y-%m-%dT%H:%M:%fZ','now')
WHERE NOT EXISTS (SELECT 1 FROM categories WHERE parent_id = (SELECT id FROM categories WHERE parent_id IS NULL AND name = 'サロン・スクール') AND name = 'パーソナルジム');
UPDATE categories SET is_active = 1, sort_order = 1 WHERE parent_id = (SELECT id FROM categories WHERE parent_id IS NULL AND name = 'サロン・スクール') AND name = 'パーソナルジム';
INSERT INTO categories (id, parent_id, name, sort_order, is_active, created_at, updated_at)
SELECT 'sheet-p3-c2', (SELECT id FROM categories WHERE parent_id IS NULL AND name = 'サロン・スクール'), '英会話', 2, 1, strftime('%Y-%m-%dT%H:%M:%fZ','now'), strftime('%Y-%m-%dT%H:%M:%fZ','now')
WHERE NOT EXISTS (SELECT 1 FROM categories WHERE parent_id = (SELECT id FROM categories WHERE parent_id IS NULL AND name = 'サロン・スクール') AND name = '英会話');
UPDATE categories SET is_active = 1, sort_order = 2 WHERE parent_id = (SELECT id FROM categories WHERE parent_id IS NULL AND name = 'サロン・スクール') AND name = '英会話';
INSERT INTO categories (id, parent_id, name, sort_order, is_active, created_at, updated_at)
SELECT 'sheet-p3-c3', (SELECT id FROM categories WHERE parent_id IS NULL AND name = 'サロン・スクール'), '資格・プログラミング', 3, 1, strftime('%Y-%m-%dT%H:%M:%fZ','now'), strftime('%Y-%m-%dT%H:%M:%fZ','now')
WHERE NOT EXISTS (SELECT 1 FROM categories WHERE parent_id = (SELECT id FROM categories WHERE parent_id IS NULL AND name = 'サロン・スクール') AND name = '資格・プログラミング');
UPDATE categories SET is_active = 1, sort_order = 3 WHERE parent_id = (SELECT id FROM categories WHERE parent_id IS NULL AND name = 'サロン・スクール') AND name = '資格・プログラミング';
INSERT INTO categories (id, parent_id, name, sort_order, is_active, created_at, updated_at)
SELECT 'sheet-p4', NULL, '金融', 4, 1, strftime('%Y-%m-%dT%H:%M:%fZ','now'), strftime('%Y-%m-%dT%H:%M:%fZ','now')
WHERE NOT EXISTS (SELECT 1 FROM categories WHERE parent_id IS NULL AND name = '金融');
UPDATE categories SET is_active = 1, sort_order = 4 WHERE parent_id IS NULL AND name = '金融';
INSERT INTO categories (id, parent_id, name, sort_order, is_active, created_at, updated_at)
SELECT 'sheet-p4-c0', (SELECT id FROM categories WHERE parent_id IS NULL AND name = '金融'), 'カードローン', 0, 1, strftime('%Y-%m-%dT%H:%M:%fZ','now'), strftime('%Y-%m-%dT%H:%M:%fZ','now')
WHERE NOT EXISTS (SELECT 1 FROM categories WHERE parent_id = (SELECT id FROM categories WHERE parent_id IS NULL AND name = '金融') AND name = 'カードローン');
UPDATE categories SET is_active = 1, sort_order = 0 WHERE parent_id = (SELECT id FROM categories WHERE parent_id IS NULL AND name = '金融') AND name = 'カードローン';
INSERT INTO categories (id, parent_id, name, sort_order, is_active, created_at, updated_at)
SELECT 'sheet-p4-c1', (SELECT id FROM categories WHERE parent_id IS NULL AND name = '金融'), 'クレジットカード', 1, 1, strftime('%Y-%m-%dT%H:%M:%fZ','now'), strftime('%Y-%m-%dT%H:%M:%fZ','now')
WHERE NOT EXISTS (SELECT 1 FROM categories WHERE parent_id = (SELECT id FROM categories WHERE parent_id IS NULL AND name = '金融') AND name = 'クレジットカード');
UPDATE categories SET is_active = 1, sort_order = 1 WHERE parent_id = (SELECT id FROM categories WHERE parent_id IS NULL AND name = '金融') AND name = 'クレジットカード';
INSERT INTO categories (id, parent_id, name, sort_order, is_active, created_at, updated_at)
SELECT 'sheet-p4-c2', (SELECT id FROM categories WHERE parent_id IS NULL AND name = '金融'), '投資・証券', 2, 1, strftime('%Y-%m-%dT%H:%M:%fZ','now'), strftime('%Y-%m-%dT%H:%M:%fZ','now')
WHERE NOT EXISTS (SELECT 1 FROM categories WHERE parent_id = (SELECT id FROM categories WHERE parent_id IS NULL AND name = '金融') AND name = '投資・証券');
UPDATE categories SET is_active = 1, sort_order = 2 WHERE parent_id = (SELECT id FROM categories WHERE parent_id IS NULL AND name = '金融') AND name = '投資・証券';
INSERT INTO categories (id, parent_id, name, sort_order, is_active, created_at, updated_at)
SELECT 'sheet-p4-c3', (SELECT id FROM categories WHERE parent_id IS NULL AND name = '金融'), '保険', 3, 1, strftime('%Y-%m-%dT%H:%M:%fZ','now'), strftime('%Y-%m-%dT%H:%M:%fZ','now')
WHERE NOT EXISTS (SELECT 1 FROM categories WHERE parent_id = (SELECT id FROM categories WHERE parent_id IS NULL AND name = '金融') AND name = '保険');
UPDATE categories SET is_active = 1, sort_order = 3 WHERE parent_id = (SELECT id FROM categories WHERE parent_id IS NULL AND name = '金融') AND name = '保険';
INSERT INTO categories (id, parent_id, name, sort_order, is_active, created_at, updated_at)
SELECT 'sheet-p5', NULL, '人材', 5, 1, strftime('%Y-%m-%dT%H:%M:%fZ','now'), strftime('%Y-%m-%dT%H:%M:%fZ','now')
WHERE NOT EXISTS (SELECT 1 FROM categories WHERE parent_id IS NULL AND name = '人材');
UPDATE categories SET is_active = 1, sort_order = 5 WHERE parent_id IS NULL AND name = '人材';
INSERT INTO categories (id, parent_id, name, sort_order, is_active, created_at, updated_at)
SELECT 'sheet-p5-c0', (SELECT id FROM categories WHERE parent_id IS NULL AND name = '人材'), '転職', 0, 1, strftime('%Y-%m-%dT%H:%M:%fZ','now'), strftime('%Y-%m-%dT%H:%M:%fZ','now')
WHERE NOT EXISTS (SELECT 1 FROM categories WHERE parent_id = (SELECT id FROM categories WHERE parent_id IS NULL AND name = '人材') AND name = '転職');
UPDATE categories SET is_active = 1, sort_order = 0 WHERE parent_id = (SELECT id FROM categories WHERE parent_id IS NULL AND name = '人材') AND name = '転職';
INSERT INTO categories (id, parent_id, name, sort_order, is_active, created_at, updated_at)
SELECT 'sheet-p5-c1', (SELECT id FROM categories WHERE parent_id IS NULL AND name = '人材'), '求人・アルバイト', 1, 1, strftime('%Y-%m-%dT%H:%M:%fZ','now'), strftime('%Y-%m-%dT%H:%M:%fZ','now')
WHERE NOT EXISTS (SELECT 1 FROM categories WHERE parent_id = (SELECT id FROM categories WHERE parent_id IS NULL AND name = '人材') AND name = '求人・アルバイト');
UPDATE categories SET is_active = 1, sort_order = 1 WHERE parent_id = (SELECT id FROM categories WHERE parent_id IS NULL AND name = '人材') AND name = '求人・アルバイト';
INSERT INTO categories (id, parent_id, name, sort_order, is_active, created_at, updated_at)
SELECT 'sheet-p5-c2', (SELECT id FROM categories WHERE parent_id IS NULL AND name = '人材'), '副業', 2, 1, strftime('%Y-%m-%dT%H:%M:%fZ','now'), strftime('%Y-%m-%dT%H:%M:%fZ','now')
WHERE NOT EXISTS (SELECT 1 FROM categories WHERE parent_id = (SELECT id FROM categories WHERE parent_id IS NULL AND name = '人材') AND name = '副業');
UPDATE categories SET is_active = 1, sort_order = 2 WHERE parent_id = (SELECT id FROM categories WHERE parent_id IS NULL AND name = '人材') AND name = '副業';
INSERT INTO categories (id, parent_id, name, sort_order, is_active, created_at, updated_at)
SELECT 'sheet-p6', NULL, '食品・生活用品', 6, 1, strftime('%Y-%m-%dT%H:%M:%fZ','now'), strftime('%Y-%m-%dT%H:%M:%fZ','now')
WHERE NOT EXISTS (SELECT 1 FROM categories WHERE parent_id IS NULL AND name = '食品・生活用品');
UPDATE categories SET is_active = 1, sort_order = 6 WHERE parent_id IS NULL AND name = '食品・生活用品';
INSERT INTO categories (id, parent_id, name, sort_order, is_active, created_at, updated_at)
SELECT 'sheet-p6-c0', (SELECT id FROM categories WHERE parent_id IS NULL AND name = '食品・生活用品'), '食品通販', 0, 1, strftime('%Y-%m-%dT%H:%M:%fZ','now'), strftime('%Y-%m-%dT%H:%M:%fZ','now')
WHERE NOT EXISTS (SELECT 1 FROM categories WHERE parent_id = (SELECT id FROM categories WHERE parent_id IS NULL AND name = '食品・生活用品') AND name = '食品通販');
UPDATE categories SET is_active = 1, sort_order = 0 WHERE parent_id = (SELECT id FROM categories WHERE parent_id IS NULL AND name = '食品・生活用品') AND name = '食品通販';
INSERT INTO categories (id, parent_id, name, sort_order, is_active, created_at, updated_at)
SELECT 'sheet-p6-c1', (SELECT id FROM categories WHERE parent_id IS NULL AND name = '食品・生活用品'), '飲料・水', 1, 1, strftime('%Y-%m-%dT%H:%M:%fZ','now'), strftime('%Y-%m-%dT%H:%M:%fZ','now')
WHERE NOT EXISTS (SELECT 1 FROM categories WHERE parent_id = (SELECT id FROM categories WHERE parent_id IS NULL AND name = '食品・生活用品') AND name = '飲料・水');
UPDATE categories SET is_active = 1, sort_order = 1 WHERE parent_id = (SELECT id FROM categories WHERE parent_id IS NULL AND name = '食品・生活用品') AND name = '飲料・水';
INSERT INTO categories (id, parent_id, name, sort_order, is_active, created_at, updated_at)
SELECT 'sheet-p6-c2', (SELECT id FROM categories WHERE parent_id IS NULL AND name = '食品・生活用品'), '日用品', 2, 1, strftime('%Y-%m-%dT%H:%M:%fZ','now'), strftime('%Y-%m-%dT%H:%M:%fZ','now')
WHERE NOT EXISTS (SELECT 1 FROM categories WHERE parent_id = (SELECT id FROM categories WHERE parent_id IS NULL AND name = '食品・生活用品') AND name = '日用品');
UPDATE categories SET is_active = 1, sort_order = 2 WHERE parent_id = (SELECT id FROM categories WHERE parent_id IS NULL AND name = '食品・生活用品') AND name = '日用品';
INSERT INTO categories (id, parent_id, name, sort_order, is_active, created_at, updated_at)
SELECT 'sheet-p6-c3', (SELECT id FROM categories WHERE parent_id IS NULL AND name = '食品・生活用品'), 'ペット', 3, 1, strftime('%Y-%m-%dT%H:%M:%fZ','now'), strftime('%Y-%m-%dT%H:%M:%fZ','now')
WHERE NOT EXISTS (SELECT 1 FROM categories WHERE parent_id = (SELECT id FROM categories WHERE parent_id IS NULL AND name = '食品・生活用品') AND name = 'ペット');
UPDATE categories SET is_active = 1, sort_order = 3 WHERE parent_id = (SELECT id FROM categories WHERE parent_id IS NULL AND name = '食品・生活用品') AND name = 'ペット';
INSERT INTO categories (id, parent_id, name, sort_order, is_active, created_at, updated_at)
SELECT 'sheet-p7', NULL, '不動産・生活サービス', 7, 1, strftime('%Y-%m-%dT%H:%M:%fZ','now'), strftime('%Y-%m-%dT%H:%M:%fZ','now')
WHERE NOT EXISTS (SELECT 1 FROM categories WHERE parent_id IS NULL AND name = '不動産・生活サービス');
UPDATE categories SET is_active = 1, sort_order = 7 WHERE parent_id IS NULL AND name = '不動産・生活サービス';
INSERT INTO categories (id, parent_id, name, sort_order, is_active, created_at, updated_at)
SELECT 'sheet-p7-c0', (SELECT id FROM categories WHERE parent_id IS NULL AND name = '不動産・生活サービス'), '不動産売買・賃貸', 0, 1, strftime('%Y-%m-%dT%H:%M:%fZ','now'), strftime('%Y-%m-%dT%H:%M:%fZ','now')
WHERE NOT EXISTS (SELECT 1 FROM categories WHERE parent_id = (SELECT id FROM categories WHERE parent_id IS NULL AND name = '不動産・生活サービス') AND name = '不動産売買・賃貸');
UPDATE categories SET is_active = 1, sort_order = 0 WHERE parent_id = (SELECT id FROM categories WHERE parent_id IS NULL AND name = '不動産・生活サービス') AND name = '不動産売買・賃貸';
INSERT INTO categories (id, parent_id, name, sort_order, is_active, created_at, updated_at)
SELECT 'sheet-p7-c1', (SELECT id FROM categories WHERE parent_id IS NULL AND name = '不動産・生活サービス'), '引越し', 1, 1, strftime('%Y-%m-%dT%H:%M:%fZ','now'), strftime('%Y-%m-%dT%H:%M:%fZ','now')
WHERE NOT EXISTS (SELECT 1 FROM categories WHERE parent_id = (SELECT id FROM categories WHERE parent_id IS NULL AND name = '不動産・生活サービス') AND name = '引越し');
UPDATE categories SET is_active = 1, sort_order = 1 WHERE parent_id = (SELECT id FROM categories WHERE parent_id IS NULL AND name = '不動産・生活サービス') AND name = '引越し';
INSERT INTO categories (id, parent_id, name, sort_order, is_active, created_at, updated_at)
SELECT 'sheet-p7-c2', (SELECT id FROM categories WHERE parent_id IS NULL AND name = '不動産・生活サービス'), '通信・光回線', 2, 1, strftime('%Y-%m-%dT%H:%M:%fZ','now'), strftime('%Y-%m-%dT%H:%M:%fZ','now')
WHERE NOT EXISTS (SELECT 1 FROM categories WHERE parent_id = (SELECT id FROM categories WHERE parent_id IS NULL AND name = '不動産・生活サービス') AND name = '通信・光回線');
UPDATE categories SET is_active = 1, sort_order = 2 WHERE parent_id = (SELECT id FROM categories WHERE parent_id IS NULL AND name = '不動産・生活サービス') AND name = '通信・光回線';
INSERT INTO categories (id, parent_id, name, sort_order, is_active, created_at, updated_at)
SELECT 'sheet-p7-c3', (SELECT id FROM categories WHERE parent_id IS NULL AND name = '不動産・生活サービス'), 'エネルギー', 3, 1, strftime('%Y-%m-%dT%H:%M:%fZ','now'), strftime('%Y-%m-%dT%H:%M:%fZ','now')
WHERE NOT EXISTS (SELECT 1 FROM categories WHERE parent_id = (SELECT id FROM categories WHERE parent_id IS NULL AND name = '不動産・生活サービス') AND name = 'エネルギー');
UPDATE categories SET is_active = 1, sort_order = 3 WHERE parent_id = (SELECT id FROM categories WHERE parent_id IS NULL AND name = '不動産・生活サービス') AND name = 'エネルギー';

-- 新しい中分類に判定基準の初期値（仕様書 第8章）を入れる
INSERT OR IGNORE INTO judge_rules (category_id, metric, enabled, direction, hit_value, fair_value, early_value, updated_at)
SELECT id, 'spend', 1, 'gte', NULL, NULL, NULL, strftime('%Y-%m-%dT%H:%M:%fZ','now') FROM categories WHERE id LIKE 'sheet-%-c%';
INSERT OR IGNORE INTO judge_rules (category_id, metric, enabled, direction, hit_value, fair_value, early_value, updated_at)
SELECT id, 'cpa', 1, 'lte', NULL, NULL, NULL, strftime('%Y-%m-%dT%H:%M:%fZ','now') FROM categories WHERE id LIKE 'sheet-%-c%';
INSERT OR IGNORE INTO judge_rules (category_id, metric, enabled, direction, hit_value, fair_value, early_value, updated_at)
SELECT id, 'mcvr', 1, 'gte', 12, 10, 10, strftime('%Y-%m-%dT%H:%M:%fZ','now') FROM categories WHERE id LIKE 'sheet-%-c%';
INSERT OR IGNORE INTO judge_rules (category_id, metric, enabled, direction, hit_value, fair_value, early_value, updated_at)
SELECT id, 'cv', 1, 'gte', NULL, NULL, NULL, strftime('%Y-%m-%dT%H:%M:%fZ','now') FROM categories WHERE id LIKE 'sheet-%-c%';
INSERT OR IGNORE INTO judge_rules (category_id, metric, enabled, direction, hit_value, fair_value, early_value, updated_at)
SELECT id, 'fsver', 1, 'lte', 45, 50, 50, strftime('%Y-%m-%dT%H:%M:%fZ','now') FROM categories WHERE id LIKE 'sheet-%-c%';
INSERT OR IGNORE INTO judge_rules (category_id, metric, enabled, direction, hit_value, fair_value, early_value, updated_at)
SELECT id, 'oar', 1, 'gte', 20, 18, 18, strftime('%Y-%m-%dT%H:%M:%fZ','now') FROM categories WHERE id LIKE 'sheet-%-c%';
INSERT OR IGNORE INTO judge_settings (category_id, window_type, min_days, min_spend, early_days, updated_at)
SELECT id, 'cumulative', 7, 0, 30, strftime('%Y-%m-%dT%H:%M:%fZ','now') FROM categories WHERE id LIKE 'sheet-%-c%';

-- シートに無い仮の分類を非表示（商材が付いているものは残す）
UPDATE categories SET is_active = 0
WHERE parent_id IS NOT NULL
  AND (SELECT name FROM categories p WHERE p.id = categories.parent_id) || '|' || name NOT IN ('美容・コスメ|スキンケア', '美容・コスメ|エイジングケア', '美容・コスメ|ヘアケア', '美容・コスメ|メイク', '美容・コスメ|ボディケア', '健康食品・サプリ|ダイエット', '健康食品・サプリ|腸活', '健康食品・サプリ|睡眠', '健康食品・サプリ|関節', '健康食品・サプリ|青汁・栄養補助', '美容医療・クリニック|医療脱毛', '美容医療・クリニック|AGA・薄毛', '美容医療・クリニック|美容皮膚科', '美容医療・クリニック|歯科矯正', 'サロン・スクール|エステ・脱毛サロン', 'サロン・スクール|パーソナルジム', 'サロン・スクール|英会話', 'サロン・スクール|資格・プログラミング', '金融|カードローン', '金融|クレジットカード', '金融|投資・証券', '金融|保険', '人材|転職', '人材|求人・アルバイト', '人材|副業', '食品・生活用品|食品通販', '食品・生活用品|飲料・水', '食品・生活用品|日用品', '食品・生活用品|ペット', '不動産・生活サービス|不動産売買・賃貸', '不動産・生活サービス|引越し', '不動産・生活サービス|通信・光回線', '不動産・生活サービス|エネルギー')
  AND id NOT IN (SELECT category_id FROM products);
UPDATE categories SET is_active = 0
WHERE parent_id IS NULL
  AND name NOT IN ('美容・コスメ', '健康食品・サプリ', '美容医療・クリニック', 'サロン・スクール', '金融', '人材', '食品・生活用品', '不動産・生活サービス')
  AND NOT EXISTS (SELECT 1 FROM categories c WHERE c.parent_id = categories.id AND c.is_active = 1);
