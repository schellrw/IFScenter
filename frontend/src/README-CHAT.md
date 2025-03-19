# IFS Assistant Chat Integration

This document outlines the chat functionality implemented for the IFS Assistant application, enabling users to have conversations with their IFS parts.

## Overview

The chat integration leverages the pgvector extension in PostgreSQL to provide semantic search capabilities and integrates with the Hugging Face API for LLM (Large Language Model) interaction. The frontend components facilitate a user-friendly chat experience with parts that stays true to each part's unique characteristics.

## Components

### Pages

1. **ChatPage** (`frontend/src/pages/ChatPage.js`)
   - Main chat interface for conversations with a part
   - Handles message sending and receiving
   - Displays chat history with user and part messages
   - Auto-scrolls to newest messages

2. **ConversationsPage** (`frontend/src/pages/ConversationsPage.js`)
   - Lists all conversations with a specific part
   - Allows creating new conversations
   - Provides search functionality (both text-based and semantic)
   - Displays conversation creation dates and titles

### Utility Components

1. **GenerateVectorsButton** (`frontend/src/components/GenerateVectorsButton.js`)
   - Generates personality vectors for a part
   - Enables semantic search functionality
   - Simple button component with loading state and notifications

## Integration with Backend

The chat components interact with the following backend endpoints:

1. `GET /api/parts/{part_id}/conversations` - Retrieves all conversations for a part
2. `POST /api/parts/{part_id}/conversations` - Creates a new conversation
3. `GET /api/conversations/{conversation_id}` - Gets details and messages for a specific conversation
4. `POST /api/conversations/{conversation_id}/messages` - Sends a message and gets the part's response
5. `GET /api/conversations/search` - Searches conversations by text or semantic similarity
6. `POST /api/parts/{part_id}/personality-vectors` - Generates personality vectors for a part

## Features

1. **Real-time Messaging**
   - Optimistic message rendering before server confirmation
   - Loading indicators while waiting for part responses

2. **Semantic Search**
   - Vector-based search using pgvector
   - Search conversations by content similarity
   - Both text and semantic search modes

3. **Conversation Management**
   - Create new conversations
   - View conversation history
   - Continue existing conversations

4. **Personality Vectors**
   - Generate embeddings for parts' personalities
   - Enable finding similar parts through vector search
   - Power semantic search functionality

## Style Guide

The chat interface follows the application's existing Material-UI theme with:

- Message bubbles styled differently for users and parts
- Avatars with initials for users and parts
- Responsive design for various screen sizes
- Loading indicators for better user experience

## Usage

1. **Starting a Chat**: From a part's details page, click "Start Chat"
2. **Sending Messages**: Type a message and press Enter or click the send button
3. **Generating Vectors**: Click "Generate Vectors" on a part's detail page
4. **Viewing Conversations**: Click "View Conversations" on a part's detail page
5. **Searching Conversations**: Use the search box in the conversations view

## Implementation Details

- Vector embeddings are 384-dimensional from the 'all-MiniLM-L6-v2' model
- Part responses are generated using the Mistral AI model
- All chat data is stored in PostgreSQL with pgvector extension
- Authentication is required for all chat operations

## Future Enhancements

1. Multiple conversation support with naming and organization
2. Chat summarization for long conversations
3. Media attachments in conversations
4. More advanced semantic search features
5. Export/import of conversation histories 