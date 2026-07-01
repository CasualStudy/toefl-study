import json

grammar_dict = {
    1: [
        {"point": "非限制性定语从句", "explanation": "which引导非限制性定语从句 (which lay about 50 kilometers...)，补充说明 Teotihuacan 的具体位置。"},
        {"point": "介词短语作时间状语", "explanation": "by 200–100 B.C. 表示“在公元前200到100年之前/期间”，作整个句子的时间状语。"}
    ],
    2: [
        {"point": "插入语", "explanation": "between about A.D. 150 and 700 作为插入语，补充说明鼎盛时期 (height) 的具体时间段。"},
        {"point": "并列谓语", "explanation": "主语 it 后接了两个并列谓语：had a population 和 covered at least..."}
    ],
    3: [
        {"point": "长并列宾语", "explanation": "had 后面接了6个由逗号和and连接的并列名词短语作宾语，展示城市的复杂构成。"}
    ],
    4: [
        {"point": "被动语态", "explanation": "were involved in (被卷入，参与)，强调“规划和中央控制”被应用在了城市扩张中。"}
    ],
    5: [
        {"point": "介词短语作定语", "explanation": "with most parts of Mesoamerica 作为 contacts 的后置定语，说明“联系”的对象。"}
    ],
    6: [
        {"point": "并列特殊疑问句", "explanation": "How did... 和 why did... 两个特殊疑问句由 and 连接，构成并列句。"}
    ],
    7: [
        {"point": "完全倒装结构", "explanation": "Among the main factors are... 是一个完全倒装句。正常的语序是 ... are among the main factors。为了强调表语 among the main factors 而提前。"}
    ],
    8: [
        {"point": "长同位语", "explanation": "for instance 后面跟着的四个并列名词短语，都是 other factors 的同位语，用于举例说明“其他因素”具体有哪些。"}
    ],
    9: [
        {"point": "被动语态", "explanation": "is implicated in (与...有牵连/有关)，circumstantially 是副词作状语修饰被动语态。"}
    ],
    10: [
        {"point": "介词短语作时间状语", "explanation": "Prior to (在...之前) 引导时间状语，相当于 before。"}
    ],
    11: [
        {"point": "独立主格结构", "explanation": "with much of its agricultural land covered by lava 是典型的“with + 逻辑主语 + 过去分词”构成的独立主格结构，作伴随状语。"}
    ],
    12: [
        {"point": "独立主格结构", "explanation": "With Cuicuilco eliminated as a potential rival 同上，是 with 引导的独立主格，作原因/背景状语。"},
        {"point": "情态动词表推测 (虚拟语气)", "explanation": "might have emerged 表示对过去可能发生的事情的推测（本可能崛起）。"}
    ],
    13: [
        {"point": "强调句型中的助动词强调", "explanation": "did arise 中的 did 是用来强调谓语动词 arise 的，表示“确实崛起”。"},
        {"point": "宾语从句", "explanation": "that Teotihuacan was... 引导的是 indicates 的宾语从句。"}
    ],
    14: [
        {"point": "形式主语 It", "explanation": "It seems likely that... 中，It 是形式主语，真正的主语是 that 引导的从句。"},
        {"point": "双宾语结构", "explanation": "gave the city a competitive edge 中，the city 是间接宾语，a competitive edge 是直接宾语。"}
    ],
    15: [
        {"point": "插入语", "explanation": "like many other places... 作为插入语，打断了主谓结构 (The valley was rich...)，起补充类比的作用。"}
    ],
    16: [
        {"point": "过去完成时定语从句", "explanation": "that had been in great demand 是修饰 resource 的定语从句，由于 demand 发生在过去某一时间点之前，所以用过去完成时。"}
    ],
    17: [
        {"point": "过去分词作后置定语", "explanation": "found at Olmec sites 是过去分词短语，作后置定语修饰 obsidian tools。"},
        {"point": "宾语从句", "explanation": "has shown that... 引导宾语从句，说明研究表明的具体内容。"}
    ],
    18: [
        {"point": "情态动词表推测", "explanation": "must have been recognized 表示对过去事实的强烈肯定推测（一定已经被认识到）。"}
    ],
    19: [
        {"point": "双宾语结构", "explanation": "gave the elite residents (间接宾语) access to... (直接宾语)。"},
        {"point": "并列连词", "explanation": "as well as 连接两个并列的直接宾语 access to... 和 a relatively prosperous life。"}
    ],
    20: [
        {"point": "情态动词表推测", "explanation": "may have attracted 表示对过去可能发生的事情的推测（可能已经吸引了）。"}
    ],
    21: [
        {"point": "不定式作宾语", "explanation": "attempted to attract... 中，to attract... 是动词 attempt 的宾语。"}
    ],
    22: [
        {"point": "形式主语 It", "explanation": "It is also probable that... 中 It 为形式主语。"},
        {"point": "并列主语从句", "explanation": "that 后面跟了由 and 连接的两个并列的主语从句 (Teotihuacan may have... and its shrine may have...)。"}
    ],
    23: [
        {"point": "被动语态", "explanation": "was probably fed 被动语态，表示人口被养活。"},
        {"point": "介词+动名词作方式状语", "explanation": "by increasing... 通过增加...的方式。"}
    ],
    24: [
        {"point": "定语从句", "explanation": "that emerges 是修饰 The picture 的定语从句。"},
        {"point": "长并列介词宾语", "explanation": "among 后面接了五个并列的名词/动名词短语 (obsidian mining and working, trade, population growth, irrigation, and religious tourism)。"}
    ],
    25: [
        {"point": "虚拟语气/过去将来时", "explanation": "would necessitate (将会需要)，在过去语境下表达一种必然的推演或虚拟假设。"}
    ],
    26: [
        {"point": "非限制性定语从句", "explanation": "which in turn would attract... 引导非限制性定语从句，修饰前面的 increased wealth。"}
    ],
    27: [
        {"point": "定语从句", "explanation": "who controlled the economy 修饰 the elite。"},
        {"point": "不定式作目的/结果状语", "explanation": "to physically coerce people... and serve as... 作状语，说明 the means 的作用。"}
    ],
    28: [
        {"point": "被动语态不定式", "explanation": "would have to be built，不定式的被动语态，表示“必须被建造”。"},
        {"point": "代词指代", "explanation": "and this resulted in... 中的 this 指代前面“灌溉工程被建造来养活人口”这件事。"}
    ]
}

js_content = "const toeflGrammarData = " + json.dumps(grammar_dict, indent=2, ensure_ascii=False) + ";\n"

with open("/Users/dongzhewu/Downloads/projects/english/toefl/grammarData.js", "w", encoding="utf-8") as f:
    f.write(js_content)

print("grammarData.js generated successfully.")
