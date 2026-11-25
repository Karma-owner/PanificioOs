async def run_test(page, output_dir, page_url):
    try:
        await page.set_viewport_size({"width": 375, "height": 667})
        await page.goto("https://flour-slate--9yz073vc.preview.emergentagent.com", wait_until="domcontentloaded")
        await page.wait_for_timeout(900)
        await page.get_by_text("Ricette", exact=True).last.click(force=True)
        await page.get_by_text("Etichetta allergeni", exact=True).first.click(force=True)
        await page.get_by_label("Chiudi etichetta", exact=True).click(force=True)
        print("Allergen modal close:", not await page.get_by_text("REG. UE 1169/2011", exact=True).is_visible())
        await page.get_by_text("Produzione", exact=True).last.click(force=True)
        await page.get_by_text("Avanza lotto", exact=True).first.click(force=True)
        print("Production navigation/advance completed")
        await page.get_by_text("Altro", exact=True).last.click(force=True)
        for label in ["HACCP","Resi & costi","Report"]:
            await page.get_by_text(label, exact=True).click(force=True)
            print(label, "visible")
        await page.get_by_label("Ripristina dati demo", exact=True).click(force=True)
        await page.wait_for_timeout(200)
        print("Reset control present")
        await page.set_viewport_size({"width": 768, "height": 1024})
        overflow=await page.evaluate("document.documentElement.scrollWidth > document.documentElement.clientWidth")
        print("Tablet overflow:", overflow)
    except Exception as e:
        print("FINDING:", str(e))
        raise

