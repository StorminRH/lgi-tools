## Introduction

This dev log has three jobs.

First, it is my own journal. I am not a developer by trade, and I need a written record of why things were built the way they were built. When I come back to a piece of the project weeks later, I want to understand the decision, not just the final code.

Second, it is a rough playbook for anyone else trying to build EVE tools. I do not want this to read like a polished victory lap where every choice was obvious from the start. A lot of the useful parts are the mistakes: the places where I misunderstood a system, put data in the wrong place, overbuilt something, or had to change direction after the code proved the first idea wrong.

Third, it is a plain-English bridge between the source code and the people using the site. The code is open, but code mostly tells you what happens. It does not explain the tradeoffs, the constraints, or the reason a feature took the shape it did. That is what this document is for.

Why build this when great tools already exist? The honest answer is that I built it for myself. For years, my setup was spreadsheets and one-off tools. After working with AI for a couple of years, I realized I could push those personal tools into a real web application instead of keeping them as private scraps. If it ends up being useful to other pilots, that is awesome. But the core premise was always simple: build the tool I wanted to use.

The rest of this log gets technical, but the structure is meant to build up gradually. I start with the broad shape of the system, then move into the services it runs on, then the stack it is written with, then the EVE-specific data layer and features. When a section makes a technical claim, I tie it back to the relevant files in the repository with inline file references. Those citations are there so the document stays honest. If the code changes, the explanation should change with it.

Treat this as a snapshot of my current understanding, not a permanent specification. The project is still moving, and this log will move with it.

