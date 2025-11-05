import React, { useState } from 'react';
import { Card } from '@ui/card';
import { Button } from '@ui/button';
import { Textarea } from '@ui/textarea';
import { Badge } from '@ui/badge';
import { AlertTriangle, CheckCircle, Lightbulb } from 'lucide-react';

interface Slide {
  id: string;
  title: string;
  content: string;
}

interface Suggestion {
  id: string;
  type: 'grammar' | 'style' | 'clarity';
  text: string;
  suggestion: string;
  position: { start: number; end: number };
}

interface SlideEditorProps {
  slide: Slide;
  onSlideUpdate: (slide: Slide) => void;
  suggestions: Suggestion[];
  onApplySuggestion: (suggestionId: string) => void;
}

export function SlideEditor({ slide, onSlideUpdate, suggestions, onApplySuggestion }: SlideEditorProps) {
  const [selectedText, setSelectedText] = useState('');

  const handleTitleChange = (value: string) => {
    onSlideUpdate({ ...slide, title: value });
  };

  const handleContentChange = (value: string) => {
    onSlideUpdate({ ...slide, content: value });
  };

  const getSuggestionIcon = (type: string) => {
    switch (type) {
      case 'grammar':
        return <AlertTriangle className="w-4 h-4 text-red-500" />;
      case 'style':
        return <Lightbulb className="w-4 h-4 text-yellow-500" />;
      case 'clarity':
        return <CheckCircle className="w-4 h-4 text-blue-500" />;
      default:
        return <Lightbulb className="w-4 h-4" />;
    }
  };

  const getSuggestionColor = (type: string) => {
    switch (type) {
      case 'grammar':
        return 'bg-red-50 border-red-200';
      case 'style':
        return 'bg-yellow-50 border-yellow-200';
      case 'clarity':
        return 'bg-blue-50 border-blue-200';
      default:
        return 'bg-gray-50 border-gray-200';
    }
  };

  return (
    <div className="h-full flex flex-col">
      {/* Slide Content */}
      <Card className="flex-1 p-6 mb-4">
        <div className="h-full flex flex-col space-y-4">
          <div>
            <label className="block mb-2 text-sm font-medium">Slide Title</label>
            <Textarea
              value={slide.title}
              onChange={(e) => handleTitleChange(e.target.value)}
              placeholder="Enter slide title..."
              className="min-h-[60px] text-lg font-medium resize-none"
            />
          </div>
          
          <div className="flex-1">
            <label className="block mb-2 text-sm font-medium">Slide Content</label>
            <Textarea
              value={slide.content}
              onChange={(e) => handleContentChange(e.target.value)}
              placeholder="Enter slide content..."
              className="min-h-[300px] resize-none"
            />
          </div>
        </div>
      </Card>

      {/* Suggestions Panel */}
      <Card className="p-4">
        <h3 className="font-medium mb-3 flex items-center gap-2">
          <Lightbulb className="w-4 h-4" />
          Suggestions ({suggestions.length})
        </h3>
        
        <div className="space-y-2 max-h-40 overflow-y-auto">
          {suggestions.length === 0 ? (
            <p className="text-sm text-muted-foreground">No suggestions available</p>
          ) : (
            suggestions.map((suggestion) => (
              <div
                key={suggestion.id}
                className={`p-3 rounded-lg border ${getSuggestionColor(suggestion.type)}`}
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="flex-1">
                    <div className="flex items-center gap-2 mb-1">
                      {getSuggestionIcon(suggestion.type)}
                      <Badge variant="outline" className="text-xs">
                        {suggestion.type}
                      </Badge>
                    </div>
                    <p className="text-sm mb-2">
                      <span className="font-medium">Original:</span> "{suggestion.text}"
                    </p>
                    <p className="text-sm">
                      <span className="font-medium">Suggestion:</span> {suggestion.suggestion}
                    </p>
                  </div>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => onApplySuggestion(suggestion.id)}
                  >
                    Apply
                  </Button>
                </div>
              </div>
            ))
          )}
        </div>
      </Card>
    </div>
  );
}