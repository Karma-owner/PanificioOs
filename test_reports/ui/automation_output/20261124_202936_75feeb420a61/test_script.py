async def run_test(page, output_dir, page_url):
    import os
    from playwright.async_api import TimeoutError as PlaywrightTimeoutError

    try:
        await page.set_viewport_size({"width": 375, "height": 667})
        await page.goto("https://flour-slate--9yz073vc.preview.emergentagent.com", wait_until="networkidle")
        await page.wait_for_timeout(1200)
        print("Loaded:", await page.get_by_text("PanificioOS", exact=True).is_visible())
        # mode selector
        await page.get_by_text("Industriale", exact=True).last.scroll_into_view_if_needed()
        await page.get_by_text("Industriale", exact=True).last.click(force=True)
        print("Mode selected:", await page.get_by_text("Industriale", exact=True).first.is_visible())
        # note creation
        await page.get_by_text("+ Nota", exact=True).click(force=True)
        inp = page.locator('input[placeholder*="consegna"], textarea[placeholder*="consegna"]').first
        await inp.fill("TEST_nota verifica")
        await page.get_by_text("Notte", exact=True).last.click(force=True)
        await page.get_by_text("Urgente", exact=True).last.click(force=True)
        await page.get_by_text("Pubblica", exact=True).click(force=True)
        print("Note created:", await page.get_by_text("TEST_nota verifica", exact=True).is_visible())
        # filter
        await page.get_by_text("Notte", exact=True).last.click(force=True)
        print("Filter visible:", await page.get_by_text("TEST_nota verifica", exact=True).is_visible())
        # recipes
        await page.get_by_text("Ricette", exact=True).last.click(force=True)
        await page.wait_for_timeout(400)
        recipes=["Pane Comune Tipo 0 (Metodo Diretto)","Ciabatta Alta Idratazione (con Biga 40%)","Pane Integrale 100% Lievito Madre (Licoli)","Focaccia Pugliese"]
        for name in recipes:
            print("Recipe", name, await page.get_by_text(name, exact=True).count())
        await page.get_by_text("Etichetta allergeni", exact=True).first.click(force=True)
        print("Label title:", await page.get_by_text("REG. UE 1169/2011", exact=True).is_visible())
        print("Print button:", await page.get_by_text("Stampa etichetta", exact=True).is_visible())
        await page.get_by_text("Chiudi etichetta", exact=True).click(force=True)
        # tablet overflow
        await page.set_viewport_size({"width": 768, "height": 1024})
        await page.wait_for_timeout(300)
        overflow=await page.evaluate("document.documentElement.scrollWidth > document.documentElement.clientWidth")
        print("Tablet horizontal overflow:", overflow)
    except Exception as e:
        print("FINDING:", str(e))
        raise

