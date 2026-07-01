# Generate stopwords.js
import json

words = [
    # Pronouns & Determiners
    "the", "a", "an", "this", "that", "these", "those", "my", "your", "his", "her", "its", "our", "their", 
    "i", "you", "he", "she", "it", "we", "they", "me", "him", "us", "them", "which", "who", "whom", "whose",
    "what", "where", "when", "why", "how", "all", "any", "both", "each", "few", "more", "most", "other", "some", "such",
    
    # Prepositions & Conjunctions
    "in", "on", "at", "to", "for", "of", "with", "about", "against", "between", "into", "through", "during", "before", 
    "after", "above", "below", "from", "up", "down", "out", "off", "over", "under", "again", "further", 
    "then", "once", "here", "there", "no", "nor", "not", "only", "own", "same", "so", "than", "too", "very", "s", "t", "can", 
    "will", "just", "don", "should", "now", "and", "but", "or", "because", "as", "until", "while", "by",
    
    # Basic Verbs & Auxiliaries
    "is", "am", "are", "was", "were", "be", "been", "being",
    "have", "has", "had", "having",
    "do", "does", "did", "doing",
    "could", "shall", "would", "may", "might", "must",
    "get", "got", "getting", "make", "made", "making", "take", "took", "taken", "see", "saw", "seen", "look", "looking",
    "come", "came", "coming", "go", "went", "gone", "going", "know", "knew", "known", "think", "thought", "say", "said",
    "tell", "told", "find", "found", "give", "gave", "given", "use", "used", "using", "work", "worked", "working",
    
    # Basic Nouns & Adjectives
    "time", "person", "year", "way", "day", "thing", "man", "world", "life", "hand", "part", "child", "eye", "woman",
    "place", "week", "case", "point", "government", "company", "number", "group", "problem", "fact", "city",
    "people", "good", "new", "first", "last", "long", "great", "little", "old", "right", "big", "high",
    "different", "small", "large", "next", "early", "young", "important", "public", "bad", "able",
    
    # Numbers
    "one", "two", "three", "four", "five", "six", "seven", "eight", "nine", "ten", "hundred", "thousand", "million",
    "second", "third",
    
    # Very common adverbs
    "also", "well", "even", "much", "always", "often", "never", "today", "yesterday", "tomorrow",
    "really", "yes"
]

# Ensure uniqueness
words = sorted(list(set(words)))

js_content = f"// 初中基础词汇表，用于自动剔除无需测试的简单词\nconst basicStopWords = new Set({json.dumps(words)});\n"

with open("/Users/dongzhewu/Downloads/projects/english/toefl/stopwords.js", "w", encoding="utf-8") as f:
    f.write(js_content)
    
print("stopwords.js created.")
