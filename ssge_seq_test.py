import json
import subprocess
import time
import re

API = "http://localhost:8000"

listings = [
    ("apartment_sale", {
        "deal": "sale", "type": "apartment", "price": 72000, "currency": "USD",
        "area": 45, "rooms": 2, "bedrooms": 1, "floor": 5, "floors_total": 9,
        "address": "Тбилиси, ул. Костава 25", "city": "Тбилиси",
        "description": "Уютная двухкомнатная квартира в центре Тбилиси. Свежий ремонт, кондиционер.",
        "photo_urls": ["https://images.unsplash.com/photo-1522708323590-d24dbb6b0267?w=800"],
        "contact_name": "Даниэль", "contact_phone": "558388481",
    }),
    ("apartment_rent", {
        "deal": "rent", "type": "apartment", "price": 800, "currency": "USD",
        "area": 55, "rooms": 3, "bedrooms": 2, "floor": 3, "floors_total": 12,
        "address": "Тбилиси, ул. Пекини 44", "city": "Тбилиси",
        "description": "Просторная трёхкомнатная квартира в районе Вера. Мебель, техника, Wi-Fi.",
        "photo_urls": ["https://images.unsplash.com/photo-1502672260266-1c1ef2d93688?w=800"],
        "contact_name": "Даниэль", "contact_phone": "558388481",
    }),
    ("house_sale", {
        "deal": "sale", "type": "house", "price": 150000, "currency": "USD",
        "area": 180, "rooms": 5, "bedrooms": 3, "floor": 1, "floors_total": 2,
        "yard_area": 200,
        "address": "Тбилиси, ул. Дигоми 12", "city": "Тбилиси",
        "description": "Кирпичный дом в Дигоми. Гараж, сад, автономное отопление.",
        "photo_urls": ["https://images.unsplash.com/photo-1564013799919-ab600027ffc6?w=800"],
        "contact_name": "Даниэль", "contact_phone": "558388481",
    }),
    ("house_rent", {
        "deal": "rent", "type": "house", "price": 1500, "currency": "USD",
        "area": 120, "rooms": 3, "bedrooms": 2, "floor": 1, "floors_total": 2,
        "yard_area": 100,
        "address": "Тбилиси, ул. Агмашенебели 78", "city": "Тбилиси",
        "description": "Дом в тихом районе. Двор, гараж, рядом школа и магазины.",
        "photo_urls": ["https://images.unsplash.com/photo-1600596542815-ffad4c1539a9?w=800"],
        "contact_name": "Даниэль", "contact_phone": "558388481",
    }),
    ("land_sale", {
        "deal": "sale", "type": "land", "price": 50000, "currency": "USD",
        "area": 300,
        "address": "Тбилиси, ул. Сабуртало 5", "city": "Тбилиси",
        "description": "Земельный участок 300 м² в Сабуртало. Коммуникации на участке.",
        "photo_urls": ["https://images.unsplash.com/photo-1500382017468-9049fed747ef?w=800"],
        "contact_name": "Даниэль", "contact_phone": "558388481",
    }),
    ("land_rent", {
        "deal": "rent", "type": "land", "price": 300, "currency": "USD",
        "area": 500,
        "address": "Тбилиси, ул. Ваке 15", "city": "Тбилиси",
        "description": "Участок 500 м² в Ваке. Аренда на долгий срок.",
        "photo_urls": ["https://images.unsplash.com/photo-1500382017468-9049fed747ef?w=800"],
        "contact_name": "Даниэль", "contact_phone": "558388481",
    }),
    ("commercial_sale", {
        "deal": "sale", "type": "commercial", "price": 200000, "currency": "USD",
        "area": 80, "rooms": 2,
        "address": "Тбилиси, ул. Шардени 10", "city": "Тбилиси",
        "description": "Коммерческое помещение в центре Тбилиси. Офис или магазин.",
        "photo_urls": ["https://images.unsplash.com/photo-1497366216548-37526070297c?w=800"],
        "contact_name": "Даниэль", "contact_phone": "558388481",
    }),
    ("commercial_rent", {
        "deal": "rent", "type": "commercial", "price": 1200, "currency": "USD",
        "area": 60, "rooms": 1,
        "address": "Тбилиси, ул. Костава 33", "city": "Тбилиси",
        "description": "Офисное помещение 60 м². Ремонт, кондиционер, парковка.",
        "photo_urls": ["https://images.unsplash.com/photo-1497366811353-6870744d04b2?w=800"],
        "contact_name": "Даниэль", "contact_phone": "558388481",
    }),
]

def curl_post(url, data):
    r = subprocess.run(
        ["curl", "-s", "-X", "POST", url, "-H", "Content-Type: application/json", "-d", json.dumps(data)],
        capture_output=True, text=True, timeout=30
    )
    return json.loads(r.stdout)

def curl_get(url):
    r = subprocess.run(["curl", "-s", url], capture_output=True, text=True, timeout=10)
    return r.stdout

def wait_task(task_id, max_wait=300):
    for i in range(max_wait // 5):
        time.sleep(5)
        data = curl_get(f"{API}/api/publish/{task_id}")
        status = json.loads(data)
        ss = status.get("results", {}).get("ss_ge", {})
        if ss.get("status") in ("success", "failed"):
            return ss
    return {"status": "timeout"}

results = []

for idx, (name, listing) in enumerate(listings):
    print(f"\n{'='*60}")
    print(f"[{idx+1}/8] {name}")
    print(f"{'='*60}")
    
    # Step 1: PUBLISH
    payload = {"user_id": "test_user", "sites": ["ss_ge"], "listing": listing}
    resp = curl_post(f"{API}/api/publish", payload)
    task_id = resp.get("task_id")
    print(f"  PUBLISH task_id={task_id}")
    
    ss = wait_task(task_id)
    url = ss.get("url", "")
    error = ss.get("error", "")
    pub_status = ss.get("status", "unknown")
    print(f"  PUBLISH status={pub_status} url={url}")
    
    if pub_status != "success" or not url:
        print(f"  FAILED to publish: {error}")
        results.append({"name": name, "publish": "failed", "error": error, "delete": "skipped"})
        time.sleep(3)
        continue
    
    # Step 2: VERIFY listing is live
    time.sleep(3)
    page_html = curl_get(url)
    is_archived = "заявка устарела" in page_html or "удалена" in page_html
    has_content = "Квартира" in page_html or "Дом" in page_html or "Участок" in page_html or "Коммерч" in page_html or "Офис" in page_html
    print(f"  VERIFY archived={is_archived} has_content={has_content}")
    
    if is_archived:
        print(f"  WARNING: Listing archived immediately!")
        results.append({"name": name, "publish": "archived", "url": url, "delete": "skipped"})
        time.sleep(3)
        continue
    
    # Step 3: DELETE
    listing_id = re.search(r'/(\d+)$', url)
    lid = listing_id.group(1) if listing_id else ""
    print(f"  DELETE listing_id={lid}...")
    
    del_resp = curl_post(f"{API}/api/listings/delete", {
        "listing_id": lid, "platforms": ["ssge"], "listing_url": url
    })
    del_result = del_resp.get("results", {}).get("ssge", {})
    del_success = del_result.get("success", False)
    print(f"  DELETE API result: {del_result}")
    
    # Step 4: VERIFY deletion
    time.sleep(5)
    page_html2 = curl_get(url)
    still_alive = "Квартира" in page_html2 or "Дом" in page_html2 or "Участок" in page_html2
    is_gone = "заявка устарела" in page_html2 or "удалена" in page_html2 or "410" in page_html2 or not has_content
    print(f"  VERIFY_DELETE still_alive={still_alive} is_gone={is_gone}")
    
    results.append({
        "name": name,
        "publish": "success",
        "url": url,
        "listing_id": lid,
        "delete_api": del_success,
        "verify_delete": "confirmed" if is_gone else "failed",
    })
    
    time.sleep(3)

print(f"\n{'='*60}")
print("FINAL RESULTS:")
print(f"{'='*60}")
for r in results:
    print(f"  {r['name']}: publish={r['publish']} delete={r.get('delete_api', r.get('delete', '?'))} verify={r.get('verify_delete', '?')} url={r.get('url', '-')}")

with open('/tmp/ssge_seq_results.json', 'w') as f:
    json.dump(results, f, indent=2, ensure_ascii=False)

