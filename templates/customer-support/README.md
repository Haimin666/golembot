# Customer Support Bot Template

A Golem-based IM customer support assistant that automatically answers common questions when connected to Lark / DingTalk / WeCom.

## Quick Start

1. Edit `faq.md` to add your FAQ content
2. Configure IM channel credentials in `.env`
3. Run `golem-ai gateway` to start the service

## File Overview

- `faq.md` — FAQ knowledge base (Q&A format)
- `unanswered.md` — Log of unanswered questions (auto-generated)
- `skills/faq-support/` — Customer support Skill definition
