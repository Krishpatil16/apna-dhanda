// v10.10 (2026-10-25): AI product icons. iconFor(product) picks one of the 287 icons under /icons/<slug>.webp:
// uploaded photo first → exact name match → fuzzy (brand words, sizes and units dropped; Hindi/English synonyms) → category icon → emoji.
// Pure and memoised: a 100+ item list resolves each name once. Works in the browser (window.AKIcons) and in node tests (module.exports).
(function(root){
"use strict";
const D = {"v":1,"items":[["aashirvaad-atta","Aashirvaad Atta","आशीर्वाद आटा","atta"],["pillsbury-chakki-atta","Pillsbury Chakki Atta","पिल्सबरी चक्की आटा","atta"],["fortune-chakki-atta","Fortune Chakki Atta","फॉर्च्यून चक्की आटा","atta"],["loose-gehun-atta","Loose Gehun Atta","गेहूं का आटा (खुला)","atta"],["maida","Maida","मैदा","atta"],["sooji-rava","Sooji (Rava)","सूजी (रवा)","atta"],["besan","Besan","बेसन","atta"],["makka-atta","Makka Atta","मक्का आटा","atta"],["bajra-atta","Bajra Atta","बाजरा आटा","atta"],["jowar-atta","Jowar Atta","ज्वार आटा","atta"],["ragi-atta","Ragi Atta","रागी आटा","atta"],["basmati-rice","Basmati Rice","बासमती चावल","atta"],["india-gate-basmati-rice","India Gate Basmati Rice","इंडिया गेट बासमती चावल","atta"],["daawat-basmati-rice","Daawat Basmati Rice","दावत बासमती चावल","atta"],["kolam-rice","Kolam Rice","कोलम चावल","atta"],["sona-masoori-rice","Sona Masoori Rice","सोना मसूरी चावल","atta"],["poha-chivda","Poha (Chivda)","पोहा","atta"],["toor-dal-arhar","Toor Dal (Arhar)","तूर दाल (अरहर)","atta"],["moong-dal","Moong Dal","मूंग दाल","atta"],["moong-dal-chilka","Moong Dal Chilka","मूंग दाल छिलका","atta"],["masoor-dal","Masoor Dal","मसूर दाल","atta"],["chana-dal","Chana Dal","चना दाल","atta"],["urad-dal","Urad Dal","उड़द दाल","atta"],["urad-dal-chilka","Urad Dal Chilka","उड़द दाल छिलका","atta"],["kabuli-chana","Kabuli Chana","काबुली चना","atta"],["kala-chana","Kala Chana","काला चना","atta"],["rajma","Rajma","राजमा","atta"],["sabut-moong","Sabut Moong","साबुत मूंग","atta"],["lobia","Lobia","लोबिया","atta"],["matar-safed","Matar (Safed)","सफ़ेद मटर","atta"],["sabudana","Sabudana","साबूदाना","atta"],["dalia","Dalia","दलिया","atta"],["fortune-soyabean-oil","Fortune Soyabean Oil","फॉर्च्यून सोयाबीन तेल","oil"],["fortune-sunflower-oil","Fortune Sunflower Oil","फॉर्च्यून सूरजमुखी तेल","oil"],["saffola-gold-oil","Saffola Gold Oil","सफोला गोल्ड तेल","oil"],["sunflower-oil","Sunflower Oil","सूरजमुखी तेल","oil"],["mustard-oil","Mustard Oil","सरसों का तेल","oil"],["fortune-kachi-ghani-mustard-oil","Fortune Kachi Ghani Mustard Oil","फॉर्च्यून कच्ची घानी सरसों तेल","oil"],["groundnut-oil","Groundnut Oil","मूंगफली तेल","oil"],["rice-bran-oil","Rice Bran Oil","राइस ब्रान तेल","oil"],["palm-oil","Palm Oil","पाम तेल","oil"],["coconut-oil-edible","Coconut Oil (Edible)","नारियल तेल (खाने का)","oil"],["amul-ghee","Amul Ghee","अमूल घी","oil"],["desi-ghee","Desi Ghee","देसी घी","oil"],["dalda-vanaspati","Dalda Vanaspati","डालडा वनस्पति","oil"],["til-oil","Til Oil","तिल का तेल","oil"],["haldi-powder","Haldi Powder","हल्दी पाउडर","masale"],["lal-mirch-powder","Lal Mirch Powder","लाल मिर्च पाउडर","masale"],["dhaniya-powder","Dhaniya Powder","धनिया पाउडर","masale"],["jeera","Jeera","जीरा","masale"],["jeera-powder","Jeera Powder","जीरा पाउडर","masale"],["garam-masala","Garam Masala","गरम मसाला","masale"],["mdh-garam-masala","MDH Garam Masala","एमडीएच गरम मसाला","masale"],["everest-garam-masala","Everest Garam Masala","एवरेस्ट गरम मसाला","masale"],["mdh-chana-masala","MDH Chana Masala","एमडीएच चना मसाला","masale"],["everest-kitchen-king","Everest Kitchen King","एवरेस्ट किचन किंग","masale"],["pav-bhaji-masala","Pav Bhaji Masala","पाव भाजी मसाला","masale"],["chhole-masala","Chhole Masala","छोले मसाला","masale"],["sambhar-masala","Sambhar Masala","सांभर मसाला","masale"],["chaat-masala","Chaat Masala","चाट मसाला","masale"],["kasuri-methi","Kasuri Methi","कसूरी मेथी","masale"],["rai-mustard-seeds","Rai (Mustard Seeds)","राई","masale"],["methi-dana","Methi Dana","मेथी दाना","masale"],["ajwain","Ajwain","अजवाइन","masale"],["saunf","Saunf","सौंफ","masale"],["kali-mirch","Kali Mirch","काली मिर्च","masale"],["laung","Laung","लौंग","masale"],["elaichi","Elaichi","इलायची","masale"],["dalchini","Dalchini","दालचीनी","masale"],["tej-patta","Tej Patta","तेज पत्ता","masale"],["hing","Hing","हींग","masale"],["kashmiri-lal-mirch","Kashmiri Lal Mirch","कश्मीरी लाल मिर्च","masale"],["sabut-lal-mirch","Sabut Lal Mirch","साबुत लाल मिर्च","masale"],["amchur-powder","Amchur Powder","अमचूर पाउडर","masale"],["til-safed","Til (Safed)","सफ़ेद तिल","masale"],["ginger-garlic-paste","Ginger Garlic Paste","अदरक लहसुन पेस्ट","masale"],["tata-salt","Tata Salt","टाटा नमक","salt"],["aashirvaad-salt","Aashirvaad Salt","आशीर्वाद नमक","salt"],["sendha-namak","Sendha Namak","सेंधा नमक","salt"],["kala-namak","Kala Namak","काला नमक","salt"],["sugar","Sugar","चीनी","salt"],["bura-powdered-sugar","Bura (Powdered Sugar)","बूरा","salt"],["mishri","Mishri","मिश्री","salt"],["gud-jaggery","Gud (Jaggery)","गुड़","salt"],["gud-powder","Gud Powder","गुड़ पाउडर","salt"],["honey-dabur","Honey (Dabur)","शहद (डाबर)","salt"],["parle-g-biscuit","Parle-G Biscuit","पारले-जी बिस्कुट","snacks"],["britannia-good-day","Britannia Good Day","ब्रिटानिया गुड डे","snacks"],["britannia-marie-gold","Britannia Marie Gold","ब्रिटानिया मैरी गोल्ड","snacks"],["parle-monaco","Parle Monaco","पारले मोनाको","snacks"],["parle-krackjack","Parle Krackjack","पारले क्रैकजैक","snacks"],["hide-seek","Hide & Seek","हाइड एंड सीक","snacks"],["oreo","Oreo","ओरियो","snacks"],["bourbon","Bourbon","बॉर्बन","snacks"],["sunfeast-dark-fantasy","Sunfeast Dark Fantasy","सनफीस्ट डार्क फैंटेसी","snacks"],["tiger-biscuit","Tiger Biscuit","टाइगर बिस्कुट","snacks"],["nutrichoice-digestive","Nutrichoice Digestive","न्यूट्रीचॉइस डाइजेस्टिव","snacks"],["rusk-toast","Rusk (Toast)","रस्क (टोस्ट)","snacks"],["haldiram-aloo-bhujia","Haldiram Aloo Bhujia","हल्दीराम आलू भुजिया","snacks"],["haldiram-moong-dal","Haldiram Moong Dal","हल्दीराम मूंग दाल","snacks"],["haldiram-navratan-mix","Haldiram Navratan Mix","हल्दीराम नवरतन मिक्स","snacks"],["bikaji-bhujia","Bikaji Bhujia","बीकाजी भुजिया","snacks"],["sev","Sev","सेव","snacks"],["mixture-namkeen","Mixture Namkeen","मिक्सचर नमकीन","snacks"],["lays-chips","Lays Chips","लेज़ चिप्स","snacks"],["kurkure","Kurkure","कुरकुरे","snacks"],["bingo-mad-angles","Bingo Mad Angles","बिंगो मैड एंगल्स","snacks"],["uncle-chipps","Uncle Chipps","अंकल चिप्स","snacks"],["peanuts-moongfali","Peanuts (Moongfali)","मूंगफली दाना","snacks"],["popcorn-act-ii","Popcorn (ACT II)","पॉपकॉर्न (एक्ट II)","snacks"],["cadbury-dairy-milk","Cadbury Dairy Milk","कैडबरी डेरी मिल्क","snacks"],["kitkat","KitKat","किटकैट","snacks"],["5-star","5 Star","फाइव स्टार","snacks"],["perk","Perk","पर्क","snacks"],["eclairs-toffee","Eclairs Toffee","एक्लेयर्स टॉफ़ी","snacks"],["pulse-candy","Pulse Candy","पल्स कैंडी","snacks"],["tata-tea-premium","Tata Tea Premium","टाटा टी प्रीमियम","bev"],["tata-tea-gold","Tata Tea Gold","टाटा टी गोल्ड","bev"],["red-label-tea","Red Label Tea","रेड लेबल चाय","bev"],["taj-mahal-tea","Taj Mahal Tea","ताज महल चाय","bev"],["wagh-bakri-tea","Wagh Bakri Tea","वाघ बकरी चाय","bev"],["society-tea","Society Tea","सोसाइटी चाय","bev"],["loose-chai-patti","Loose Chai Patti","खुली चाय पत्ती","bev"],["nescafe-classic","Nescafe Classic","नेसकैफ़े क्लासिक","bev"],["bru-instant-coffee","Bru Instant Coffee","ब्रू इंस्टेंट कॉफ़ी","bev"],["bournvita","Bournvita","बोर्नविटा","bev"],["horlicks","Horlicks","हॉर्लिक्स","bev"],["complan","Complan","कॉम्प्लान","bev"],["tang","Tang","टैंग","bev"],["rasna","Rasna","रसना","bev"],["coca-cola","Coca-Cola","कोका-कोला","bev"],["thums-up","Thums Up","थम्स अप","bev"],["sprite","Sprite","स्प्राइट","bev"],["pepsi","Pepsi","पेप्सी","bev"],["limca","Limca","लिम्का","bev"],["maaza","Maaza","माज़ा","bev"],["frooti","Frooti","फ्रूटी","bev"],["real-juice","Real Juice","रियल जूस","bev"],["bisleri-water","Bisleri Water","बिसलेरी पानी","bev"],["kinley-water","Kinley Water","किनले पानी","bev"],["red-bull","Red Bull","रेड बुल","bev"],["glucon-d","Glucon-D","ग्लूकॉन-डी","bev"],["roohafza","Roohafza","रूहअफ़ज़ा","bev"],["amul-taaza-milk","Amul Taaza Milk","अमूल ताज़ा दूध","dairy"],["amul-gold-milk","Amul Gold Milk","अमूल गोल्ड दूध","dairy"],["toned-milk-pouch","Toned Milk (Pouch)","टोन्ड दूध (पैकेट)","dairy"],["amul-butter","Amul Butter","अमूल बटर","dairy"],["amul-cheese-slices","Amul Cheese Slices","अमूल चीज़ स्लाइस","dairy"],["amul-cheese-cubes","Amul Cheese Cubes","अमूल चीज़ क्यूब","dairy"],["paneer","Paneer","पनीर","dairy"],["dahi-curd","Dahi (Curd)","दही","dairy"],["chhaas-buttermilk","Chhaas (Buttermilk)","छाछ","dairy"],["lassi","Lassi","लस्सी","dairy"],["amul-fresh-cream","Amul Fresh Cream","अमूल फ्रेश क्रीम","dairy"],["amulya-dairy-whitener","Amulya Dairy Whitener","अमूल्या डेयरी व्हाइटनर","dairy"],["milkmaid","Milkmaid","मिल्कमेड","dairy"],["eggs","Eggs","अंडे","dairy"],["bread-white","Bread (White)","ब्रेड (सफ़ेद)","dairy"],["brown-bread","Brown Bread","ब्राउन ब्रेड","dairy"],["pav","Pav","पाव","dairy"],["maggi-noodles","Maggi Noodles","मैगी नूडल्स","breakfast"],["yippee-noodles","Yippee Noodles","यिप्पी नूडल्स","breakfast"],["top-ramen","Top Ramen","टॉप रेमन","breakfast"],["kelloggs-corn-flakes","Kelloggs Corn Flakes","केलॉग्स कॉर्न फ्लेक्स","breakfast"],["kelloggs-chocos","Kelloggs Chocos","केलॉग्स चोकोस","breakfast"],["quaker-oats","Quaker Oats","क्वेकर ओट्स","breakfast"],["saffola-oats","Saffola Oats","सफोला ओट्स","breakfast"],["vermicelli-sevai","Vermicelli (Sevai)","सेवई","breakfast"],["macaroni","Macaroni","मैकरोनी","breakfast"],["pasta","Pasta","पास्ता","breakfast"],["mtr-rava-idli-mix","MTR Rava Idli Mix","एमटीआर रवा इडली मिक्स","breakfast"],["gits-gulab-jamun-mix","Gits Gulab Jamun Mix","गिट्स गुलाब जामुन मिक्स","breakfast"],["knorr-soup","Knorr Soup","नॉर सूप","breakfast"],["papad","Papad","पापड़","breakfast"],["fryums","Fryums","फ्रायम्स","breakfast"],["custard-powder","Custard Powder","कस्टर्ड पाउडर","breakfast"],["baking-soda","Baking Soda","खाने का सोडा","breakfast"],["eno","Eno","ईनो","breakfast"],["kissan-tomato-ketchup","Kissan Tomato Ketchup","किसान टमाटर केचप","sauce"],["maggi-tomato-ketchup","Maggi Tomato Ketchup","मैगी टमाटर केचप","sauce"],["kissan-mixed-fruit-jam","Kissan Mixed Fruit Jam","किसान मिक्स फ्रूट जैम","sauce"],["mango-pickle-aam-achar","Mango Pickle (Aam Achar)","आम का अचार","sauce"],["mixed-pickle","Mixed Pickle","मिक्स अचार","sauce"],["lime-pickle","Lime Pickle","नींबू का अचार","sauce"],["green-chilli-sauce","Green Chilli Sauce","हरी मिर्च सॉस","sauce"],["soya-sauce","Soya Sauce","सोया सॉस","sauce"],["vinegar","Vinegar","सिरका","sauce"],["mayonnaise","Mayonnaise","मेयोनीज़","sauce"],["peanut-butter","Peanut Butter","पीनट बटर","sauce"],["nutella","Nutella","न्यूटेला","sauce"],["kaju-cashew","Kaju (Cashew)","काजू","dry"],["badam-almond","Badam (Almond)","बादाम","dry"],["kishmish-raisins","Kishmish (Raisins)","किशमिश","dry"],["akhrot-walnut","Akhrot (Walnut)","अखरोट","dry"],["pista","Pista","पिस्ता","dry"],["khajur-dates","Khajur (Dates)","खजूर","dry"],["makhana","Makhana","मखाना","dry"],["nariyal-sukha","Nariyal (Sukha)","सूखा नारियल","dry"],["chironji","Chironji","चिरौंजी","dry"],["lux-soap","Lux Soap","लक्स साबुन","personal"],["lifebuoy-soap","Lifebuoy Soap","लाइफबॉय साबुन","personal"],["dettol-soap","Dettol Soap","डेटॉल साबुन","personal"],["santoor-soap","Santoor Soap","संतूर साबुन","personal"],["dove-soap","Dove Soap","डव साबुन","personal"],["cinthol-soap","Cinthol Soap","सिंथॉल साबुन","personal"],["medimix-soap","Medimix Soap","मेडिमिक्स साबुन","personal"],["colgate-toothpaste","Colgate Toothpaste","कोलगेट टूथपेस्ट","personal"],["pepsodent-toothpaste","Pepsodent Toothpaste","पेप्सोडेंट टूथपेस्ट","personal"],["dabur-red-paste","Dabur Red Paste","डाबर रेड पेस्ट","personal"],["close-up-toothpaste","Close Up Toothpaste","क्लोज़ अप टूथपेस्ट","personal"],["toothbrush","Toothbrush","टूथब्रश","personal"],["clinic-plus-shampoo","Clinic Plus Shampoo","क्लिनिक प्लस शैम्पू","personal"],["head-shoulders-shampoo","Head & Shoulders Shampoo","हेड एंड शोल्डर्स शैम्पू","personal"],["sunsilk-shampoo","Sunsilk Shampoo","सनसिल्क शैम्पू","personal"],["parachute-coconut-oil","Parachute Coconut Oil","पैराशूट नारियल तेल","personal"],["dabur-amla-hair-oil","Dabur Amla Hair Oil","डाबर आंवला तेल","personal"],["navratna-oil","Navratna Oil","नवरत्न तेल","personal"],["bajaj-almond-drops","Bajaj Almond Drops","बजाज आलमंड ड्रॉप्स","personal"],["fair-lovely-glow-lovely","Fair & Lovely (Glow & Lovely)","ग्लो एंड लवली क्रीम","personal"],["ponds-powder","Ponds Powder","पॉन्ड्स पाउडर","personal"],["boroline","Boroline","बोरोलीन","personal"],["vaseline","Vaseline","वैसलीन","personal"],["nivea-cream","Nivea Cream","निविया क्रीम","personal"],["gillette-razor","Gillette Razor","जिलेट रेज़र","personal"],["shaving-cream","Shaving Cream","शेविंग क्रीम","personal"],["whisper-pads","Whisper Pads","व्हिस्पर पैड","personal"],["stayfree-pads","Stayfree Pads","स्टेफ्री पैड","personal"],["dettol-antiseptic","Dettol Antiseptic","डेटॉल एंटीसेप्टिक","personal"],["hand-wash-lifebuoy","Hand Wash (Lifebuoy)","हैंड वॉश (लाइफबॉय)","personal"],["sanitizer","Sanitizer","सैनिटाइज़र","personal"],["pampers-diapers","Pampers Diapers","पैम्पर्स डायपर","personal"],["johnson-baby-powder","Johnson Baby Powder","जॉनसन बेबी पाउडर","personal"],["odomos","Odomos","ओडोमॉस","personal"],["vicks-vaporub","Vicks VapoRub","विक्स वेपोरब","personal"],["surf-excel-powder","Surf Excel Powder","सर्फ एक्सेल पाउडर","cleaning"],["surf-excel-bar","Surf Excel Bar","सर्फ एक्सेल बार","cleaning"],["ariel-powder","Ariel Powder","एरियल पाउडर","cleaning"],["tide-powder","Tide Powder","टाइड पाउडर","cleaning"],["wheel-powder","Wheel Powder","व्हील पाउडर","cleaning"],["ghadi-detergent","Ghadi Detergent","घड़ी डिटर्जेंट","cleaning"],["rin-bar","Rin Bar","रिन बार","cleaning"],["nirma-powder","Nirma Powder","निरमा पाउडर","cleaning"],["vim-bar","Vim Bar","विम बार","cleaning"],["vim-liquid","Vim Liquid","विम लिक्विड","cleaning"],["pril-liquid","Pril Liquid","प्रिल लिक्विड","cleaning"],["harpic","Harpic","हार्पिक","cleaning"],["lizol-floor-cleaner","Lizol Floor Cleaner","लाइज़ोल फ्लोर क्लीनर","cleaning"],["colin-glass-cleaner","Colin Glass Cleaner","कॉलिन ग्लास क्लीनर","cleaning"],["phenyl","Phenyl","फिनाइल","cleaning"],["comfort-fabric-conditioner","Comfort Fabric Conditioner","कम्फर्ट फैब्रिक कंडीशनर","cleaning"],["robin-blue-neel","Robin Blue (Neel)","रॉबिन ब्लू (नील)","cleaning"],["scotch-brite-scrub","Scotch-Brite Scrub","स्कॉच-ब्राइट स्क्रब","cleaning"],["steel-scrubber","Steel Scrubber","स्टील स्क्रबर","cleaning"],["jhadu-broom","Jhadu (Broom)","झाड़ू","cleaning"],["pocha-floor-cloth","Pocha (Floor Cloth)","पोंछा","cleaning"],["garbage-bags","Garbage Bags","कचरा थैली","cleaning"],["good-knight-refill","Good Knight Refill","गुड नाइट रिफ़िल","cleaning"],["all-out-refill","All Out Refill","ऑल आउट रिफ़िल","cleaning"],["mortein-coil","Mortein Coil","मॉर्टीन कॉइल","cleaning"],["hit-spray","HIT Spray","हिट स्प्रे","cleaning"],["naphthalene-balls","Naphthalene Balls","फिनाइल की गोली","cleaning"],["matchbox","Matchbox","माचिस","cleaning"],["candles","Candles","मोमबत्ती","cleaning"],["battery-aa","Battery (AA)","बैटरी (AA)","cleaning"],["aluminium-foil","Aluminium Foil","एल्युमिनियम फ़ॉयल","cleaning"],["agarbatti","Agarbatti","अगरबत्ती","pooja"],["dhoop-batti","Dhoop Batti","धूप बत्ती","pooja"],["camphor-kapur","Camphor (Kapur)","कपूर","pooja"],["cotton-batti","Cotton Batti","रुई बत्ती","pooja"],["kumkum-roli","Kumkum (Roli)","रोली कुमकुम","pooja"],["pooja-oil","Pooja Oil","पूजा तेल","pooja"],["diya","Diya","दीया","pooja"],["paper-plates","Paper Plates","पेपर प्लेट","pooja"],["paper-cups","Paper Cups","पेपर कप","pooja"]],"cats":{"atta":["Atta, Rice & Dal","आटा, चावल, दाल"],"oil":["Oil & Ghee","तेल और घी"],"masale":["Masale & Spices","मसाले"],"salt":["Salt, Sugar & Jaggery","नमक, चीनी, गुड़"],"snacks":["Biscuits & Snacks","बिस्कुट और नमकीन"],"bev":["Tea, Coffee & Drinks","चाय, कॉफ़ी, पेय"],"dairy":["Dairy & Eggs","दूध, डेयरी, अंडे"],"breakfast":["Breakfast & Instant food","नाश्ता और इंस्टेंट"],"sauce":["Sauces, Pickle & Jam","सॉस, अचार, जैम"],"dry":["Dry fruits","ड्राई फ्रूट्स"],"personal":["Personal care","पर्सनल केयर"],"cleaning":["Cleaning & Household","साफ़-सफ़ाई और घर"],"pooja":["Pooja & Others","पूजा और अन्य"]}};
const IV = "1"; // bump when the icon files change (they are served with a 1-year immutable cache)
const url = slug => "/icons/" + slug + ".webp?v=" + IV;

// Multi-word names that mean one thing (applied before splitting into words)
const PHRASES = [
  ["dairy milk","dairymilk"],["डेरी मिल्क","dairymilk"],["good knight","goodknight"],["गुड नाइट","goodknight"],["good day","goodday"],["daily good","dailygood"],
  ["mother dairy","motherdairy"],["harvest gold","harvestgold"],["paper boat","paperboat"],["b natural","bnatural"],["surf excel","surfexcel"],["सर्फ एक्सेल","surfexcel"],
  ["head shoulders","headshoulders"],["close up","closeup"],["clinic plus","clinicplus"],["क्लिनिक प्लस","clinicplus"],["india gate","indiagate"],["all out","allout"],
  ["red label","redlabel"],["taj mahal","tajmahal"],["wagh bakri","waghbakri"],["hide seek","hideseek"],["dark fantasy","darkfantasy"],["marie gold","mariegold"],
  ["mad angles","madangles"],["kitchen king","kitchenking"],["thums up","thumsup"],["red bull","redbull"],["5 star","fivestar"],["scotch brite","scotchbrite"],
  ["tata sampann","tatasampann"],["glow lovely","glowlovely"],["fair lovely","glowlovely"],["dant kanti","toothpaste"],["दंत कांति","toothpaste"],
  ["black pepper","kalimirch"],["kali mirch","kalimirch"],["काली मिर्च","kalimirch"],["red chilli","lalmirch"],["red chili","lalmirch"],["lal mirch","lalmirch"],["लाल मिर्च","lalmirch"],
  ["green chilli","harimirch"],["green chili","harimirch"],["हरी मिर्च","harimirch"],["fruit power","juice"],["aam panna","mangodrink"],["आम पन्ना","mangodrink"],
  ["corn flakes","cornflakes"],["cornflakes","cornflakes"],["gulab jamun","gulabjamun"],["गुलाब जामुन","gulabjamun"],["refined oil","sunflower oil"],["रिफाइंड तेल","sunflower oil"],
  ["toilet cleaner","toiletcleaner"],["floor cleaner","floorcleaner"],["glass cleaner","glasscleaner"],["hand wash","handwash"],["dish wash","dishwash"],["dishwash","dishwash"],
  ["bartan","dishwash"],["बर्तन","dishwash"],["cold drink","colddrink"],["soft drink","colddrink"],["baby powder","babypowder"],["hair oil","hairoil"],["sanitary pad","pads"],
  ["coconut oil","coconutoil"],["नारियल तेल","coconutoil"],["mustard oil","mustardoil"],["सरसों तेल","mustardoil"],["sarson tel","mustardoil"],["sarso tel","mustardoil"],
  ["brown bread","brownbread"],["sona masoori","sonamasoori"],["सोना मसूरी","sonamasoori"],["garam masala","garammasala"],["गरम मसाला","garammasala"],
  ["chana masala","chanamasala"],["चना मसाला","chanamasala"],["chhole masala","chanamasala"],["kabuli chana","kabulichana"],["kala chana","kalachana"],["काला चना","kalachana"],
  ["kala namak","kalanamak"],["काला नमक","kalanamak"],["black salt","kalanamak"],["sendha namak","sendhanamak"],["rock salt","sendhanamak"],["moong dal","moongdal"],["मूंग दाल","moongdal"],
  ["masoor dal","masoordal"],["मसूर दाल","masoordal"],["chana dal","chanadal"],["चना दाल","chanadal"],["urad dal","uraddal"],["उड़द दाल","uraddal"],["उडद दाल","uraddal"],
  ["toor dal","toordal"],["tur dal","toordal"],["arhar dal","toordal"],["तूर दाल","toordal"],["तुअर दाल","toordal"],["अरहर दाल","toordal"],
  ["jeera powder","jeerapowder"],["जीरा पाउडर","jeerapowder"],["cumin powder","jeerapowder"],["pav bhaji","pavbhaji"],["peanut butter","peanutbutter"],["tomato ketchup","ketchup"],
  ["tomato sauce","ketchup"],["soya sauce","soyasauce"],["soy sauce","soyasauce"],["chilli sauce","chillisauce"],["fresh cream","cream"],["cheese slice","cheeseslice"],
  ["mouth wash","mouthwash"],["tooth paste","toothpaste"],["tooth brush","toothbrush"],["washing powder","detergent powder"],["detergent bar","detergentbar"],
  ["detergent cake","detergentbar"],["washing bar","detergentbar"],["kapde ka sabun","detergentbar"],["mosquito coil","mosquitocoil"],["paper plate","paperplate"],["paper cup","papercup"]
];
// One word → one concept (Hindi, Hinglish and English spellings of the same thing)
const SYN = {};
const syn = (canon, words) => words.split(/\s+/).forEach(w => { if (w) SYN[w] = canon; });
syn("tea","tea chai chay चाय patti पत्ती chaipatti");
syn("coffee","coffee kaafi kofi कॉफी कफी कॉफ़ी");
syn("milk","milk doodh dudh दूध");
syn("dahi","dahi curd yogurt yoghurt दही");
syn("paneer","paneer panir पनीर");
syn("butter","butter makhan makkhan मक्खन बटर");
syn("ghee","ghee ghi घी");
syn("atta","atta aata आटा flour gehu gehun गेहूं wheat");
syn("maida","maida मैदा");
syn("suji","suji sooji suji rava rawa semolina सूजी रवा upma उपमा");
syn("besan","besan बेसन");
syn("rice","rice chawal chaval चावल");
syn("dal","dal daal दाल lentil lentils pulses");
syn("oil","oil oils tel तेल");
syn("salt","salt namak नमक");
syn("sugar","sugar cheeni chini चीनी shakkar शक्कर");
syn("gud","gud gur jaggery गुड");
syn("soap","soap soaps sabun साबुन");
syn("detergent","detergent detergents डिटर्जेंट sarf matic");
syn("biscuit","biscuit biscuits बिस्कुट बिस्किट cookie cookies");
syn("navratan","navratan panchratan navratna");
syn("namkeen","namkeen नमकीन mixture मिक्सचर bhujia भुजिया bhel भेल bhelpuri bhakarwadi भाकरवडी sticks chakli farsan");
syn("chips","chips चिप्स wafers wafer");
syn("toothpaste","toothpaste टूथपेस्ट manjan मंजन dant दंत mouthwash माउथवॉश");
syn("shampoo","shampoo शैम्पू शैंपू");
syn("noodles","noodles नूडल्स noodle ramen chowmein");
syn("haldi","haldi turmeric हल्दी");
syn("lalmirch","lalmirch chilli chili mirch मिर्च mirchi");
syn("jeera","jeera jira cumin जीरा");
syn("dhaniya","dhaniya dhania coriander धनिया");
syn("eggs","egg eggs anda ande अंडा अंडे");
syn("bread","bread ब्रेड");
syn("matchbox","matchbox matchboxes maachis machis माचिस");
syn("agarbatti","agarbatti incense अगरबत्ती");
syn("candles","candle candles mombatti मोमबत्ती");
syn("chocolate","chocolate chocolates चॉकलेट choco");
syn("juice","juice जूस drink");
syn("colddrink","colddrink cola coke");
syn("water","water pani paani पानी");
syn("poha","poha पोहा chivda चिवड़ा चिवडा");
syn("peanuts","peanuts peanut moongfali mungfali मूंगफली groundnuts");
syn("jam","jam जैम");
syn("pickle","pickle achar achaar अचार");
syn("ketchup","ketchup केचप");
syn("sunflower","sunflower refined");
syn("detergentbar","detergentbar");
syn("pads","pads pad napkin napkins");
syn("diapers","diaper diapers pants");
syn("mosquito","mosquito machhar मच्छर");
syn("broom","broom jhadu jhaadu झाड़ू झाडू");
syn("garammasala","garammasala");
syn("kaju","kaju cashew cashews काजू");
syn("badam","badam almond almonds बादाम");
syn("kishmish","kishmish raisins raisin किशमिश");
syn("elaichi","elaichi cardamom इलायची");
syn("laung","laung cloves clove लौंग");
syn("hing","hing asafoetida हींग");
syn("saunf","saunf fennel सौंफ");
syn("ajwain","ajwain carom अजवाइन");
syn("rai","rai mustardseeds राई");
syn("methi","methi fenugreek मेथी");
syn("rajma","rajma राजमा kidney");
syn("oats","oats ओट्स");
syn("pasta","pasta पास्ता");
syn("sevai","sevai seviyan vermicelli सेवई");
syn("papad","papad पापड़ पापड");
syn("honey","honey shahad शहद");
syn("cream","cream क्रीम");
syn("cheese","cheese चीज़ चीज");
syn("lassi","lassi लस्सी");
syn("chhaas","chhaas chaas chhach buttermilk छाछ");
syn("toothbrush","toothbrush brush ब्रश");
syn("razor","razor blade blades");
syn("battery","battery batteries cell बैटरी");
syn("antiseptic","antiseptic एंटीसेप्टिक");
syn("handwash","handwash");
syn("sanitizer","sanitizer sanitiser सैनिटाइज़र सैनिटाइजर");
syn("phenyl","phenyl phenyle फिनाइल");
syn("camphor","camphor kapur kapoor कपूर");
syn("diya","diya diyas dia दीया दिया");
syn("makhana","makhana makhane मखाना fox");
syn("dates","dates khajur खजूर");
syn("walnut","walnut walnuts akhrot अखरोट");
syn("pista","pista pistachio pistachios पिस्ता");
syn("sabudana","sabudana sago साबूदाना");
syn("dalia","dalia daliya porridge दलिया");
syn("glucose","glucose glucon");
syn("custard","custard कस्टर्ड");
syn("vinegar","vinegar sirka सिरका");
syn("foil","foil फ़ॉयल फॉयल");
syn("scrubber","scrubber scrub स्क्रबर");
const STOP = new Set("the and of with for a an ka ki ke ko का की के को में me loose khula khuli खुला खुली pack packet pouch pouches refill new big small mini mega jumbo family value combo fresh premium special classic super extra rich original regular plain pure natural active advanced plus total strong easy fast instant quick soft glow choice xl xxl power daily best gold silver taaza tazaa ताज़ा ताजा गोल्ड प्रीमियम क्लासिक इंस्टेंट".split(" "));
const WEAK = new Set("powder पाउडर liquid लिक्विड bar बार cake whole sabut साबुत seeds seed dana दाना mix मिक्स mixed fruit फ्रूट masala मसाला white safed सफ़ेद सफेद red green yellow brown black kala lal hari bath cleaner क्लीनर wash spray stick tube bottle box jar can sauce oil tel".split(" ").map(w => SYN[w] || w));
// Brand words: they help pick between packs, but a name made only of a brand still needs it to match
const BRAND = new Set(("aashirvaad pillsbury fortune indiagate daawat kolam saffola amul mdh everest tata tatasampann catch britannia parle sunfeast haldiram haldirams bikaji cadbury nestle kellogg kelloggs mtr gits knorr kissan maggi colgate pepsodent dabur closeup clinicplus headshoulders sunsilk parachute lux lifebuoy dettol santoor dove cinthol medimix surfexcel ariel tide wheel ghadi rin nirma vim pril harpic lizol colin patanjali motherdairy harvestgold dailygood real paperboat bnatural whisper stayfree pampers goodknight allout mortein odomos hit fevicol classmate nescafe bru redlabel tajmahal waghbakri society bournvita horlicks complan tang rasna pepsi sprite limca maaza frooti bisleri kinley lays kurkure bingo uncle quaker yippee kitkat perk dalda navratna bajaj ponds vaseline nivea gillette johnson vicks comfort robin scotchbrite shahi cothas aachi eastern ptc gowardhan nandini heritage verka parag sudha anik nutrichoice monaco krackjack hideseek darkfantasy goodday mariegold oreo tiger "+
  "आशीर्वाद पिल्सबरी फॉर्च्यून अमूल एमडीएच एवरेस्ट टाटा ब्रिटानिया पारले पारलेजी कैडबरी किसान मैगी कोलगेट डाबर पैराशूट लक्स लाइफबॉय डेटॉल विम हार्पिक लाइज़ोल लाइजोल पतंजलि नेसकैफ़े नेसकैफे ब्रू घड़ी घडी हल्दीराम").split(" ").map(w => SYN[w] || w));
// Extra concepts an icon stands for (so "Dishwash Bar" finds the Vim bar, "Mouthwash" a toothpaste)
const TAGS = {
  "vim-bar":"dishwash","vim-liquid":"dishwash","pril-liquid":"dishwash","harpic":"toiletcleaner","lizol-floor-cleaner":"floorcleaner","phenyl":"floorcleaner","colin-glass-cleaner":"glasscleaner",
  "surf-excel-powder":"detergent","ariel-powder":"detergent","tide-powder":"detergent","wheel-powder":"detergent","nirma-powder":"detergent","ghadi-detergent":"detergent",
  "surf-excel-bar":"detergentbar detergent","rin-bar":"detergentbar detergent","comfort-fabric-conditioner":"detergent",
  "colgate-toothpaste":"toothpaste","pepsodent-toothpaste":"toothpaste","dabur-red-paste":"toothpaste","close-up-toothpaste":"toothpaste",
  "maggi-noodles":"noodles","yippee-noodles":"noodles","top-ramen":"noodles","nescafe-classic":"coffee","bru-instant-coffee":"coffee",
  "bournvita":"healthdrink","horlicks":"healthdrink","complan":"healthdrink","coca-cola":"colddrink","thums-up":"colddrink","sprite":"colddrink","pepsi":"colddrink","limca":"colddrink",
  "maaza":"juice mangodrink","frooti":"juice mangodrink","real-juice":"juice","tang":"juice","rasna":"juice","roohafza":"sharbat","bisleri-water":"water","kinley-water":"water","red-bull":"energydrink",
  "cadbury-dairy-milk":"chocolate","kitkat":"chocolate","5-star":"chocolate","perk":"chocolate","eclairs-toffee":"toffee","pulse-candy":"toffee",
  "lays-chips":"chips","uncle-chipps":"chips","bingo-mad-angles":"chips","kurkure":"chips namkeen","haldiram-aloo-bhujia":"namkeen","haldiram-moong-dal":"namkeen","haldiram-navratan-mix":"namkeen","bikaji-bhujia":"namkeen","sev":"namkeen",
  "oreo":"biscuit","bourbon":"biscuit","sunfeast-dark-fantasy":"biscuit","hide-seek":"biscuit","britannia-good-day":"biscuit","britannia-marie-gold":"biscuit","parle-monaco":"biscuit","parle-krackjack":"biscuit","nutrichoice-digestive":"biscuit","rusk-toast":"biscuit",
  "whisper-pads":"pads","stayfree-pads":"pads","pampers-diapers":"diapers","good-knight-refill":"mosquito","all-out-refill":"mosquito","mortein-coil":"mosquito mosquitocoil","hit-spray":"mosquito","odomos":"mosquito",
  "kelloggs-corn-flakes":"cornflakes","kelloggs-chocos":"cornflakes chocolate","gits-gulab-jamun-mix":"instantmix","mtr-rava-idli-mix":"instantmix","knorr-soup":"soup",
  "parachute-coconut-oil":"hairoil coconutoil","dabur-amla-hair-oil":"hairoil","navratna-oil":"hairoil","bajaj-almond-drops":"hairoil","coconut-oil-edible":"coconutoil",
  "mustard-oil":"mustardoil","fortune-kachi-ghani-mustard-oil":"mustardoil","sona-masoori-rice":"sonamasoori","brown-bread":"brownbread","bread-white":"bread",
  "toned-milk-pouch":"milk","amul-taaza-milk":"milk","amul-gold-milk":"milk","amul-butter":"butter","amul-fresh-cream":"cream","amul-cheese-slices":"cheeseslice cheese","amul-cheese-cubes":"cheese",
  "amulya-dairy-whitener":"milkpowder","milkmaid":"condensedmilk","dettol-antiseptic":"antiseptic","hand-wash-lifebuoy":"handwash","johnson-baby-powder":"babypowder","ponds-powder":"talc",
  "fair-lovely-glow-lovely":"facecream","nivea-cream":"facecream","boroline":"facecream","vaseline":"facecream","gillette-razor":"razor","vicks-vaporub":"balm","eno":"antacid",
  "kissan-tomato-ketchup":"ketchup","maggi-tomato-ketchup":"ketchup","green-chilli-sauce":"chillisauce harimirch","soya-sauce":"soyasauce","everest-kitchen-king":"garammasala","mdh-garam-masala":"garammasala","everest-garam-masala":"garammasala",
  "mdh-chana-masala":"chanamasala","chhole-masala":"chanamasala","honey-dabur":"honey","peanuts-moongfali":"peanuts","popcorn-act-ii":"popcorn","jhadu-broom":"broom","naphthalene-balls":"mothballs",
  "paper-plates":"paperplate","paper-cups":"papercup","glucon-d":"glucose","tata-tea-premium":"tea","tata-tea-gold":"tea","red-label-tea":"tea","taj-mahal-tea":"tea","wagh-bakri-tea":"tea","society-tea":"tea"
};
// When several icons fit a plain word ("Tea", "Biscuits", "Soap"), the everyday loose/common one wins
const PREFER = new Set("loose-chai-patti parle-g-biscuit mixture-namkeen maggi-noodles lifebuoy-soap clinic-plus-shampoo colgate-toothpaste surf-excel-powder surf-excel-bar vim-bar harpic haldi-powder lal-mirch-powder dhaniya-powder jeera loose-gehun-atta basmati-rice toor-dal-arhar sunflower-oil desi-ghee toned-milk-pouch dahi-curd bread-white eggs sugar gud-jaggery tata-salt cadbury-dairy-milk lays-chips real-juice coca-cola bisleri-water nescafe-classic poha-chivda kaju-cashew garam-masala mustard-oil lizol-floor-cleaner good-knight-refill whisper-pads kissan-tomato-ketchup mango-pickle-aam-achar kissan-mixed-fruit-jam paneer amul-butter sooji-rava".split(" "));

function base(s){
  return String(s || "").toLowerCase().normalize("NFC").replace(/\u093C/g, "").replace(/\u0901/g, "\u0902")
    .replace(/['’`]s\b/g, "").replace(/[^\p{L}\p{M}\p{N}]+/gu, " ").replace(/\s+/g, " ").trim();
}
const UNITS = /(^|\s)\d+(\.\d+)?\s*(kg|kgs|g|gm|gms|gram|grams|ml|l|ltr|litre|liter|litres|pc|pcs|piece|pieces|pack|packs|x|n|किलो|ग्राम|लीटर|मिली)?(?=\s|$)/g;
function noUnits(s){ return s.replace(UNITS, " ").replace(/\s+/g, " ").trim(); }
function phrased(s){ s = " " + s + " "; for (const [a, b] of PHRASES) if (s.includes(" " + a + " ")) s = s.split(" " + a + " ").join(" " + b + " "); return s.trim(); }
function tokens(s){
  const out = []; for (const w of phrased(noUnits(base(s))).split(" ")) {
    if (!w || STOP.has(w) || (w.length < 2 && !/\d/.test(w))) continue;
    out.push(SYN[w] || (w.length > 3 && w.endsWith("s") && SYN[w.slice(0, -1)]) || w);
  } return out;
}
// ---- index (built once) ----
const exact = new Map(); const IDX = [];
const putExact = (k, slug) => { k = phrased(noUnits(base(k))); if (k && !exact.has(k)) exact.set(k, slug); };
for (const [slug, en, hi, cat] of D.items) {
  putExact(en, slug); putExact(hi, slug); putExact(slug.replace(/-/g, " "), slug);
  for (const s of [en, hi]) { const m = String(s).match(/^(.*?)\s*\((.*)\)\s*$/); if (m) { putExact(m[1], slug); const inner = base(m[2]); if (!BRAND.has(SYN[inner] || inner)) putExact(m[2], slug); } }
  const toks = new Set([...tokens(en), ...tokens(hi), ...(TAGS[slug] || "").split(" ").filter(Boolean)]);
  const content = new Set(), brands = new Set(); for (const t of toks) (BRAND.has(t) ? brands : content).add(t);
  IDX.push({slug, cat, content, brands});
}
const CAT_KEYS = [
  ["atta", /atta|aata|rice|chawal|dal|daal|grain|pulse|flour|आटा|चावल|दाल|अनाज/],
  ["oil", /\boil|ghee|tel\b|तेल|घी/], ["masale", /masal|spice|मसाल/], ["salt", /salt|sugar|namak|cheeni|jaggery|नमक|चीनी|गुड/],
  ["snacks", /biscuit|snack|namkeen|chocolate|बिस्कुट|नमकीन|स्नैक/], ["bev", /tea|coffee|drink|beverage|juice|chai|चाय|पेय|कॉफ/],
  ["dairy", /dairy|milk|egg|bread|doodh|दूध|डेयरी|अंडे/], ["breakfast", /breakfast|instant|noodle|नाश्ता|इंस्टेंट/],
  ["sauce", /sauce|pickle|jam|achar|सॉस|अचार|जैम/], ["dry", /dry ?fruit|meva|mewa|ड्राई|मेवा/],
  ["personal", /personal|care|beauty|cosmetic|baby|पर्सनल|केयर/], ["cleaning", /clean|household|home|detergent|सफ़ाई|सफाई|घर/], ["pooja", /pooja|puja|पूजा/]
];
function catKey(names){ const s = names.filter(Boolean).join(" ").toLowerCase(); if (!s) return ""; for (const [k, re] of CAT_KEYS) if (re.test(s)) return k; return ""; }
const EMOJI_CAT = {"☕":"bev","🍵":"bev","🧃":"bev","🥤":"bev","🍾":"bev","🥛":"dairy","🧈":"dairy","🧀":"dairy","🥚":"dairy","🍞":"dairy","🍪":"snacks","🥨":"snacks","🍫":"snacks","🍬":"snacks","🍿":"snacks","🥜":"snacks",
  "🧼":"personal","🧴":"personal","🪥":"personal","🪒":"personal","🧻":"cleaning","🧽":"cleaning","🧺":"cleaning","🧹":"cleaning","🚽":"cleaning","🪣":"cleaning","🌶️":"masale","🌶":"masale","🫚":"masale","🧄":"masale","🌿":"masale","🌱":"masale",
  "🌾":"atta","🍚":"atta","🫘":"atta","🍮":"atta","🛢️":"oil","🛢":"oil","🫗":"oil","🧂":"salt","🟫":"salt","🍯":"sauce","🥫":"sauce","🍜":"breakfast","🥣":"breakfast","🌰":"dry","🪔":"pooja","🕯️":"pooja","🕯":"pooja"};

const FORMS = ["powder", "bar", "liquid"];
function fuzzy(en, hi, brand, ck){
  const enT = tokens(en), all = [...enT, ...tokens(hi), ...tokens(brand)];
  const P = new Set(), PB = new Set(); for (const t of all) (BRAND.has(t) ? PB : P).add(t);
  const strongEn = enT.filter(t => !BRAND.has(t) && !WEAK.has(t)); const head = strongEn[strongEn.length - 1] || "";
  let best = null, bestS = 0;
  for (const it of IDX) {
    let s = 0, strong = 0, br = 0;
    for (const t of P) if (it.content.has(t)) { if (WEAK.has(t)) s += 1; else { s += 3; strong++; } }
    for (const t of PB) if (it.brands.has(t)) { s += 2.5; br++; }
    for (const f of FORMS) if (it.content.has(f) && !P.has(f) && FORMS.some(g => P.has(g))) s -= 2; // a powder is not a bar or a liquid
    if (!strong && !br) continue;
    if (head && it.content.has(head)) s += 1;
    if (ck && it.cat === ck) s += 0.75;
    let extra = 0; for (const t of it.content) if (!P.has(t)) extra++;
    s -= 0.2 * Math.min(extra, 6); if (PREFER.has(it.slug)) s += 0.5;
    if (s > bestS) { bestS = s; best = it.slug; }
  }
  return bestS >= 2 ? best : null;
}
const memo = new Map();
// v10.11: the grocery icons are for kirana shops only. A restaurant / salon / clinic / repair / other shop keeps its own photo or emoji.
let grocery = true;
try { const m = typeof document !== "undefined" && document.querySelector('meta[name="ak-shop"]'); if (m && m.dataset.type && m.dataset.type !== "kirana") grocery = false; } catch (e) {}
function setGrocery(on){ on = !!on; if (on !== grocery) { grocery = on; memo.clear(); } }
// p: a product, order line, stock row or catalog row. Returns {src, kind, slug} or null (keep the emoji).
function iconFor(p, cat){
  if (!p) return null;
  if (p.image) return {src: p.image, kind: "photo"};
  if (!grocery) return null;
  const en = p.name_en || p.product_name_en || p.to_name_en || "";
  const hi = p.name_hi || p.product_name || p.name || p.to_name || "";
  const brand = p.brand || "";
  const cn = [cat && cat.name_en, cat && cat.name_hi, p.cat_en, p.cat_hi, p.category_en, p.category_hi].filter(Boolean);
  const key = en + "|" + hi + "|" + brand + "|" + cn.join("/") + "|" + (p.icon || "");
  if (memo.has(key)) return memo.get(key);
  let slug = null, kind = "item";
  for (const s of [en, hi, (brand + " " + en).trim()]) { if (!s) continue; const k = phrased(noUnits(base(s))); if (exact.has(k)) { slug = exact.get(k); break; } }
  const ck = catKey(cn) || EMOJI_CAT[String(p.icon || "").trim()] || "";
  if (!slug) slug = fuzzy(en, hi, brand, ck);
  if (!slug && ck) { slug = "cat-" + ck; kind = "cat"; }
  const r = slug ? {src: url(slug), kind, slug} : null;
  if (memo.size > 5000) memo.clear(); memo.set(key, r); return r;
}
const esc = s => String(s == null ? "" : s).replace(/[&<>"']/g, c => ({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
// HTML for an image box: the photo or icon fills it (contained); the emoji stays if nothing loads.
function picHtml(p, cat, o){
  o = o || {}; const r = iconFor(p, cat), e = p && p.icon || "🛍️";
  if (!r) return o.emoji ? o.emoji(e) : `<span class="emo" aria-hidden="true">${esc(e)}</span>`;
  if (r.kind === "photo") return `<img src="${esc(r.src)}" alt="" loading="lazy" decoding="async"${o.size ? ` width="${o.size}" height="${o.size}"` : ""}>`;
  return `<img class="aki" src="${esc(r.src)}" alt="" loading="lazy" decoding="async" width="128" height="128" data-e="${esc(e)}">`;
}
// Small inline icon in front of a name (order lines, stock rows, checklists)
function inlineHtml(p, cat){
  const r = iconFor(p, cat), e = p && p.icon || "";
  if (!r) return esc(e);
  return `<img class="aki-i" src="${esc(r.src)}" alt="" loading="lazy" decoding="async" width="128" height="128" data-e="${esc(e)}">`;
}
function fail(img){ const s = document.createElement("span"); s.className = img.classList.contains("aki-i") ? "" : "emo"; s.setAttribute("aria-hidden", "true"); s.textContent = img.getAttribute("data-e") || "🛍️"; img.replaceWith(s); }
// v10.11.1: the emoji fallback for an icon that fails to load, without an inline onerror (the page CSP blocks inline handlers)
try { if (typeof document !== "undefined") document.addEventListener("error", e => { const t = e.target; if (t && t.tagName === "IMG" && t.classList && (t.classList.contains("aki") || t.classList.contains("aki-i"))) fail(t); }, true); } catch (e) {}
const api = {iconFor, picHtml, inlineHtml, fail, url, data: D, _tokens: tokens, setGrocery, get grocery(){ return grocery; }};
if (typeof module !== "undefined" && module.exports) module.exports = api;
root.AKIcons = api;
})(typeof window !== "undefined" ? window : globalThis);
