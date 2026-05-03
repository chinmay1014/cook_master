import React, { useState, useEffect, useRef } from 'react';
import { HashRouter, Routes, Route, NavLink } from 'react-router-dom';
import { Loader2, Plus, RefreshCw, Save, Trash2, Calendar, ShoppingCart, Info, Clock, Flame, Users, Share2, Search, Edit2, Play, Pause, X, Bell } from 'lucide-react';


// --- types.ts ---
interface Recipe {
  name: string;
  description: string;
  specialty: string;
  ingredients: string[];
  instructions: string[];
  calories?: string | number;
  prepTime?: string;
  cookTime?: string;
  difficulty?: 'Easy' | 'Medium' | 'Hard';
}

type DayOfWeek = 'Monday' | 'Tuesday' | 'Wednesday' | 'Thursday' | 'Friday' | 'Saturday' | 'Sunday';

type MealPlan = {
  [day in DayOfWeek]: Recipe[];
};
// --- aiService.ts ---
declare var puter: any;

const textModel = 'puter';
const visionModel = 'puter';

const recipeSchemaStr = `{
  "name": "string",
  "description": "string",
  "specialty": "string",
  "ingredients": ["string"],
  "instructions": ["string"],
  "calories": 0,
  "prepTime": "string",
  "cookTime": "string",
  "difficulty": "Easy | Medium | Hard"
}`;

const handleApiError = (error: unknown): never => {
    console.error("Puter API Error:", error);
    if (error instanceof Error) {
        // Check for specific error messages that indicate common issues.
        const message = error.message.toLowerCase();
    }
    // Throw a generic error for other API-related issues.
    throw new Error('API_ERROR');
};

const fileToGenerativePart = async (file: File) => {
  const base64EncodedDataPromise = new Promise<string>((resolve) => {
    const reader = new FileReader();
    reader.onloadend = () => resolve((reader.result as string));
    reader.readAsDataURL(file);
  });
  return await base64EncodedDataPromise;
};

const parseJsonResponse = (jsonString: string): Recipe => {
  try {
    const cleanedJsonString = jsonString.replace(/```json|```/g, '').trim();
    if (!cleanedJsonString) {
        throw new Error("Received an empty response from the API.");
    }
    return JSON.parse(cleanedJsonString) as Recipe;
  } catch (error) {
    console.error("Failed to parse JSON response:", error);
    console.error("Original string:", jsonString);
    throw new Error('PARSING_ERROR');
  }
};

const generateContentWithSchema = async (model: string, contents: any): Promise<Recipe> => {
    try {
        let textPrompt = typeof contents === 'string' ? contents : JSON.stringify(contents);
        textPrompt += `\n\nEnsure your response is valid JSON strictly matching this exact schema:\n${recipeSchemaStr}\nReturn ONLY the JSON string. Do not include markdown formatting, backticks, or any other text around the JSON.`;
        
        const response = await puter.ai.chat(textPrompt);
        const responseText = typeof response?.message?.content === 'string' 
            ? response.message.content 
            : typeof response === 'string' 
                ? response 
                : JSON.stringify(response);
                
        return parseJsonResponse(responseText);
    } catch (error) {
        // If it's a parsing error, re-throw it to be caught by the UI.
        if (error instanceof Error && error.message === 'PARSING_ERROR') {
            throw error;
        }
        // Otherwise, handle it as a generic API error.
        handleApiError(error);
    }
}

const generateRecipe = async (query: string, isStrictMode: boolean = false, language: string = 'English', difficulty?: string): Promise<Recipe> => {
  const difficultyText = difficulty && difficulty !== 'Any' ? ` The difficulty level should be ${difficulty}.` : '';
  let prompt = `Generate a detailed recipe based on this request: "${query}". Include a section about its specialty or origin. Include estimated calories, preparation time, and cooking time. Ensure ingredients have exact quantities (e.g. "2 cups flour").${difficultyText} Respond entirely in ${language} language. Respond ONLY with a JSON object that conforms to the provided schema.`;
  if (isStrictMode) {
    prompt = `I ONLY have these ingredients: "${query}". Generate a detailed recipe using STRICTLY ONLY these ingredients (plus basic pantry staples like salt, pepper, oil, water). Do not add other major ingredients. Include a section about its specialty or origin. Include estimated calories, preparation time, and cooking time. Ensure ingredients have exact quantities.${difficultyText} Respond entirely in ${language} language. Respond ONLY with a JSON object that conforms to the provided schema.`;
  }
  return generateContentWithSchema(textModel, prompt);
};


const identifyAndGenerateRecipe = async (imageFile: File, language: string = 'English', difficulty?: string): Promise<Recipe> => {
  const imagePart = await fileToGenerativePart(imageFile);
  const difficultyText = difficulty && difficulty !== 'Any' ? ` The difficulty level should be ${difficulty}.` : '';
  const textPart = {
    text: `Analyze the image. If it contains a dish or food ingredients, identify it and generate a detailed recipe for it. If the image does NOT contain food, dishes, or cooking ingredients, return a JSON with the name "Error", description "The provided image does not appear to contain food or cooking ingredients.", specialty "N/A", ingredients: ["None"], instructions: ["Please upload an image of food."], calories: 0, prepTime: "0 mins", cookTime: "0 mins". Include a section about its specialty or origin for food. Include estimated calories, preparation time, and cooking time. Ensure ingredients have exact quantities.${difficultyText} Respond entirely in ${language} language. Respond ONLY with a JSON object that conforms to the provided schema.`
  };
  return generateContentWithSchema(visionModel, { parts: [imagePart, textPart] });
};

const modifyRecipe = async (originalDishName: string, missingIngredients: string, lowerCalories: boolean = false, language: string = 'English'): Promise<Recipe> => {
    let prompt = `I want to make ${originalDishName}, but I don't have these ingredients: ${missingIngredients}. Please provide an alternative recipe for the same dish that avoids these ingredients. If that's not possible, suggest a very similar dish. Include estimated calories, preparation time, and cooking time. Ensure ingredients have exact quantities (e.g. "2 cups flour"). Respond entirely in ${language} language. Respond ONLY with a JSON object that conforms to the provided schema.`;
    if (lowerCalories) {
      prompt = `I want to make a lower-calorie version of ${originalDishName}. Please modify the recipe to be significantly lower in calories while keeping the essence of the dish. Include estimated calories, preparation time, and cooking time. Ensure ingredients have exact quantities (e.g. "2 cups flour"). Respond entirely in ${language} language. Respond ONLY with a JSON object that conforms to the provided schema.`;
    }
    return generateContentWithSchema(textModel, prompt);
};

const scaleRecipe = async (recipe: Recipe, scaleFactor: string, language: string = 'English'): Promise<Recipe> => {
    const prompt = `Take the following recipe: ${JSON.stringify(recipe)}. Scale the recipe by a factor of ${scaleFactor} (e.g., if factor is 'double', multiply quantities by 2). Adjust all ingredient quantities, and any relevant numerical values in the instructions to reflect this scaling. If calories are present, scale them too. Ensure ingredients have exact quantities. Respond entirely in ${language} language. Respond ONLY with a JSON object that conforms to the provided schema.`;
    return generateContentWithSchema(textModel, prompt);
};
// --- localStorageService.ts ---
const FAVORITES_KEY = 'ai-recipe-favorites';
const MEAL_PLAN_KEY = 'ai-recipe-meal-plan';
const CALORIE_GOAL_KEY = 'ai-recipe-calorie-goal';
const LANGUAGE_KEY = 'ai-recipe-language';

const getLanguage = (): string => {
  try {
    const lang = localStorage.getItem(LANGUAGE_KEY);
    if (lang) {
      return lang;
    }
  } catch (error) {
    console.error('Could not load language', error);
  }
  return 'English'; // default language
};

const saveLanguage = (language: string) => {
  try {
    localStorage.setItem(LANGUAGE_KEY, language);
  } catch (error) {
    console.error('Could not save language', error);
  }
};

const getCalorieGoal = (): number => {
  try {
    const goalJson = localStorage.getItem(CALORIE_GOAL_KEY);
    if (goalJson) {
      return parseInt(goalJson, 10);
    }
  } catch (error) {
    console.error('Could not load calorie goal', error);
  }
  return 2000; // default 2000 kcal
};

const saveCalorieGoal = (goal: number): void => {
  try {
    localStorage.setItem(CALORIE_GOAL_KEY, goal.toString());
  } catch (error) {
    console.error('Could not save calorie goal', error);
  }
};

const getFavorites = (): Recipe[] => {
  try {
    const favoritesJson = localStorage.getItem(FAVORITES_KEY);
    if (favoritesJson) {
      return JSON.parse(favoritesJson) as Recipe[];
    }
  } catch (error) {
    console.error('Could not load favorites from local storage', error);
  }
  return [];
};

const saveFavorites = (favorites: Recipe[]): void => {
  try {
    const favoritesJson = JSON.stringify(favorites);
    localStorage.setItem(FAVORITES_KEY, favoritesJson);
  } catch (error) {
    console.error('Could not save favorites to local storage', error);
  }
};

const emptyMealPlan: MealPlan = {
  Monday: [], Tuesday: [], Wednesday: [], Thursday: [], Friday: [], Saturday: [], Sunday: []
};

const getMealPlan = (): MealPlan => {
  try {
    const mealPlanJson = localStorage.getItem(MEAL_PLAN_KEY);
    if (mealPlanJson) {
      const parsed = JSON.parse(mealPlanJson);
      return { ...emptyMealPlan, ...parsed } as MealPlan;
    }
  } catch (error) {
    console.error('Could not load meal plan from local storage', error);
  }
  return emptyMealPlan;
};

const saveMealPlan = (mealPlan: MealPlan): void => {
  try {
    const mealPlanJson = JSON.stringify(mealPlan);
    localStorage.setItem(MEAL_PLAN_KEY, mealPlanJson);
  } catch (error) {
    console.error('Could not save meal plan to local storage', error);
  }
};
// --- Header.tsx ---
const Header: React.FC = () => {
  return (
    <header className="text-center mb-8">
      <h1 className="text-4xl sm:text-5xl font-extrabold text-transparent bg-clip-text bg-gradient-to-r from-orange-500 to-red-600 font-display">
        Master Cook
      </h1>
      <p className="mt-2 text-lg text-gray-600 dark:text-gray-300">
        Discover your next meal by name, photo, or with what you have!
      </p>
    </header>
  );
};
// --- Spinner.tsx ---
const Spinner: React.FC = () => {
  return (
    <div className="flex justify-center items-center py-10">
      <div className="animate-spin rounded-full h-16 w-16 border-t-4 border-b-4 border-blue-500"></div>
    </div>
  );
};
// --- ErrorDisplay.tsx ---
interface ErrorDisplayProps {
  message: string;
}

const ErrorDisplay: React.FC<ErrorDisplayProps> = ({ message }) => {
  return (
    <div className="glass-panel border-l-4 border-red-500 text-red-700 dark:text-red-200 p-6 rounded-2xl shadow-xl backdrop-blur-xl bg-red-50/30 dark:bg-red-900/20" role="alert">
      <p className="font-bold text-lg mb-1">An Error Occurred</p>
      <p>{message}</p>
    </div>
  );
};
// --- Welcome.tsx ---
const Welcome: React.FC = () => {
  return (
    <div className="text-center p-8 glass-panel rounded-2xl shadow-xl border-white/20">
      <h2 className="text-2xl font-bold text-gray-800 dark:text-white font-display">Welcome to Master Cook!</h2>
      <p className="mt-4 text-gray-600 dark:text-gray-300">
        Start by typing a dish name above, or upload a photo of a meal you'd like to cook.
      </p>
      <p className="mt-2 text-gray-600 dark:text-gray-300">
        Our AI will whip up a delicious recipe for you in seconds.
      </p>
    </div>
  );
};
// --- RecipeInput.tsx ---
interface RecipeInputProps {
  onGetRecipe: (type: 'text' | 'image', value: string | File, isStrictMode?: boolean, difficulty?: string) => void;
  disabled: boolean;
}

const RecipeInput: React.FC<RecipeInputProps> = ({ onGetRecipe, disabled }) => {
  const [inputType, setInputType] = useState<'text' | 'image'>('text');
  const [textQuery, setTextQuery] = useState('');
  const [isStrictMode, setIsStrictMode] = useState(false);
  const [difficulty, setDifficulty] = useState<string>('Any');
  const [file, setFile] = useState<File | null>(null);
  const [fileName, setFileName] = useState('No file chosen');
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleFileChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    if (event.target.files && event.target.files[0]) {
      const selectedFile = event.target.files[0];
      setFile(selectedFile);
      setFileName(selectedFile.name);
    }
  };

  const handleSubmit = (event: React.FormEvent) => {
    event.preventDefault();
    if (disabled) return;

    if (inputType === 'text' && textQuery.trim()) {
      onGetRecipe('text', textQuery, isStrictMode, difficulty);
    } else if (inputType === 'image' && file) {
      onGetRecipe('image', file, false, difficulty);
    }
  };

  const activeTabClass = 'bg-white/50 dark:bg-gray-700/50 border-gray-200/50 dark:border-gray-700/50 shadow-sm backdrop-blur-md';
  const inactiveTabClass = 'bg-gray-50/20 dark:bg-gray-800/20 text-gray-500 dark:text-gray-400';

  return (
    <div className="glass-panel rounded-2xl shadow-xl overflow-hidden max-w-2xl mx-auto border-white/20">
      <div className="flex border-b border-gray-200/30 dark:border-gray-700/30">
        <button
          onClick={() => setInputType('text')}
          className={`flex-1 py-3 px-4 text-center font-semibold rounded-t-lg transition-colors duration-200 ease-in-out ${inputType === 'text' ? activeTabClass : inactiveTabClass}`}
        >
          By Dish Name
        </button>
        <button
          onClick={() => setInputType('image')}
          className={`flex-1 py-3 px-4 text-center font-semibold rounded-t-lg transition-colors duration-200 ease-in-out ${inputType === 'image' ? activeTabClass : inactiveTabClass}`}
        >
          By Photo
        </button>
      </div>
      <form onSubmit={handleSubmit} className="p-6">
        {inputType === 'text' ? (
          <div className="space-y-4">
            <input
              type="text"
              value={textQuery}
              onChange={(e) => setTextQuery(e.target.value)}
              placeholder="e.g., Spaghetti Carbonara OR ingredients (chicken, rice...)"
              className="w-full px-4 py-3 border border-gray-300 dark:border-gray-600 rounded-lg bg-gray-50 dark:bg-gray-700 focus:outline-none focus:ring-2 focus:ring-blue-500 transition-shadow"
              disabled={disabled}
            />
            <label className="flex items-center space-x-2 text-sm text-gray-700 dark:text-gray-300 cursor-pointer">
              <input
                type="checkbox"
                checked={isStrictMode}
                onChange={(e) => setIsStrictMode(e.target.checked)}
                disabled={disabled}
                className="w-4 h-4 text-blue-600 bg-gray-100 border-gray-300 rounded focus:ring-blue-500 dark:focus:ring-blue-600 dark:ring-offset-gray-800 focus:ring-2 dark:bg-gray-700 dark:border-gray-600"
              />
              <span>Generate recipe strictly ONLY using the listed ingredients</span>
            </label>
          </div>
        ) : (
          <div className="flex items-center justify-center w-full">
              <label className="flex flex-col items-center justify-center w-full h-32 border-2 border-gray-300 dark:border-gray-600 border-dashed rounded-lg cursor-pointer bg-gray-50 dark:hover:bg-bray-800 dark:bg-gray-700 hover:bg-gray-100 dark:hover:border-gray-500 dark:hover:bg-gray-600 transition-colors">
                  <div className="flex flex-col items-center justify-center pt-5 pb-6">
                      <svg className="w-8 h-8 mb-3 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12"></path></svg>
                      <p className="mb-1 text-sm text-gray-500 dark:text-gray-400"><span className="font-semibold">Click to upload</span> or drag and drop</p>
                      <p className="text-xs text-gray-500 dark:text-gray-400">{fileName}</p>
                  </div>
                  <input ref={fileInputRef} type="file" className="hidden" accept="image/*" onChange={handleFileChange} disabled={disabled} />
              </label>
          </div> 
        )}
        <div className="mt-4 flex items-center space-x-2">
          <label className="text-sm font-medium text-gray-700 dark:text-gray-300 whitespace-nowrap">Difficulty:</label>
          <select 
            value={difficulty}
            onChange={(e) => setDifficulty(e.target.value)}
            disabled={disabled}
            className="flex-1 px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-gray-50 dark:bg-gray-700 focus:outline-none focus:ring-2 focus:ring-blue-500"
          >
            <option value="Any">Any</option>
            <option value="Easy">Easy</option>
            <option value="Medium">Medium</option>
            <option value="Hard">Hard</option>
          </select>
        </div>
        <button
          type="submit"
          className="mt-4 w-full bg-blue-600 text-white font-bold py-3 px-4 rounded-lg hover:bg-blue-700 disabled:bg-blue-300 dark:disabled:bg-blue-800 disabled:cursor-not-allowed transition-colors duration-300 shadow-md hover:shadow-lg focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500"
          disabled={disabled || (inputType === 'text' && !textQuery.trim()) || (inputType === 'image' && !file)}
        >
          {disabled ? 'Thinking...' : 'Get Recipe'}
        </button>
      </form>
    </div>
  );
};
// --- RecipeDisplay.tsx ---
interface RecipeDisplayProps {
  recipe: Recipe;
  onModify: (missingIngredients: string, lowerCalories?: boolean) => void;
  onScale?: (scaleFactor: string) => void;
  isLoading: boolean;
  onSave: (recipe: Recipe) => void;
  isFavorite: boolean;
  onAddToMealPlan?: (recipe: Recipe, day: DayOfWeek) => void;
  onEditRecipe?: (updatedRecipe: Recipe) => void;
}

const DAYS: DayOfWeek[] = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];

const renderInstructionWithTimers = (text: string) => {
  const parts = [];
  let lastIndex = 0;
  let match;
  const timeRegex = /\b(\d+)\s*(mins?|minutes?|hrs?|hours?|secs?|seconds?|min?)\b/gi;
  
  while ((match = timeRegex.exec(text)) !== null) {
    if (match.index > lastIndex) {
      parts.push(text.substring(lastIndex, match.index));
    }
    const amount = parseInt(match[1], 10);
    const unit = match[2].toLowerCase();
    let seconds = amount;
    if (unit.startsWith('hr') || unit.startsWith('hour')) seconds = amount * 3600;
    else if (unit.startsWith('min')) seconds = amount * 60;

    const label = `${amount} ${unit}`;
    
    parts.push(
      <button
        key={match.index}
        onClick={() => addTimer(`Timer (${label})`, seconds)}
        className="inline-flex items-center gap-1 mx-1 px-2 py-0.5 rounded-full bg-blue-100 dark:bg-blue-900/40 text-blue-700 dark:text-blue-300 hover:bg-blue-200 dark:hover:bg-blue-800/60 transition-colors text-sm font-medium focus:outline-none focus:ring-1 focus:ring-blue-500 hover:cursor-pointer"
        title={`Start ${label} timer`}
      >
        <Clock className="w-3.5 h-3.5" /> <span className="translate-y-[0.5px]">{label}</span>
      </button>
    );
    lastIndex = timeRegex.lastIndex;
  }
  if (lastIndex < text.length) {
    parts.push(text.substring(lastIndex));
  }
  return parts.length > 0 ? parts : [text];
};

const RecipeDisplay: React.FC<RecipeDisplayProps> = ({ recipe, onModify, onScale, isLoading, onSave, isFavorite, onAddToMealPlan, onEditRecipe }) => {
  const [missingIngredients, setMissingIngredients] = useState('');
  const [shareStatus, setShareStatus] = useState<'idle' | 'copied'>('idle');
  const [selectedDay, setSelectedDay] = useState<DayOfWeek | ''>('');
  const [addStatus, setAddStatus] = useState(false);
  const [isEditing, setIsEditing] = useState(false);

  const [editName, setEditName] = useState(recipe.name);
  const [editDescription, setEditDescription] = useState(recipe.description);
  const [editSpecialty, setEditSpecialty] = useState(recipe.specialty);
  const [editCalories, setEditCalories] = useState(recipe.calories ? String(recipe.calories) : '');
  const [editPrepTime, setEditPrepTime] = useState(recipe.prepTime || '');
  const [editCookTime, setEditCookTime] = useState(recipe.cookTime || '');
  const [editIngredients, setEditIngredients] = useState(recipe.ingredients.join('\n'));
  const [editInstructions, setEditInstructions] = useState(recipe.instructions.join('\n'));

  useEffect(() => {
    setEditName(recipe.name);
    setEditDescription(recipe.description);
    setEditSpecialty(recipe.specialty);
    setEditCalories(recipe.calories ? String(recipe.calories) : '');
    setEditPrepTime(recipe.prepTime || '');
    setEditCookTime(recipe.cookTime || '');
    setEditIngredients(recipe.ingredients.join('\n'));
    setEditInstructions(recipe.instructions.join('\n'));
    setIsEditing(false);
  }, [recipe]);

  const handleModifySubmit = (event: React.FormEvent) => {
    event.preventDefault();
    if (missingIngredients.trim()) {
      onModify(missingIngredients);
      setMissingIngredients('');
    }
  };

  const handleAddToMealPlan = () => {
    if (selectedDay && onAddToMealPlan) {
      onAddToMealPlan(recipe, selectedDay);
      setAddStatus(true);
      setTimeout(() => setAddStatus(false), 2000);
      setSelectedDay('');
    }
  };

  const shareText = `
Recipe for: ${recipe.name}

${recipe.description}
${recipe.prepTime ? `Prep Time: ${recipe.prepTime}\n` : ''}${recipe.cookTime ? `Cook Time: ${recipe.cookTime}\n` : ''}${recipe.calories ? `Calories: ${recipe.calories} kcal\n` : ''}
Ingredients:
${recipe.ingredients.map(i => `- ${i}`).join('\n')}

Instructions:
${recipe.instructions.map((step, index) => `${index + 1}. ${step}`).join('\n')}
    `.trim();
    
    const shareUrl = window.location.href;

    const navShare = async () => {
      if (navigator.share) {
        try {
          await navigator.share({
            title: `Recipe: ${recipe.name}`,
            text: shareText,
            url: shareUrl
          });
        } catch (error) {
          console.error('Error sharing:', error);
        }
      } else {
        handleCopyShare();
      }
    };

    const handleCopyShare = async () => {
      try {
        await navigator.clipboard.writeText(shareText);
        setShareStatus('copied');
        setTimeout(() => setShareStatus('idle'), 2000);
      } catch (error) {
        console.error('Error copying to clipboard:', error);
        alert('Failed to copy recipe to clipboard.');
      }
    };
    
    const shareToFacebook = () => {
      const url = `https://www.facebook.com/sharer/sharer.php?u=${encodeURIComponent(shareUrl)}&quote=${encodeURIComponent(shareText)}`;
      window.open(url, '_blank', 'width=600,height=400');
    };
  
    const shareToTwitter = () => {
      const url = `https://twitter.com/intent/tweet?text=${encodeURIComponent('Check out this recipe: ' + recipe.name)}&url=${encodeURIComponent(shareUrl)}`;
      window.open(url, '_blank', 'width=600,height=400');
    };
  
    const shareToPinterest = () => {
      const url = `https://pinterest.com/pin/create/button/?url=${encodeURIComponent(shareUrl)}&description=${encodeURIComponent(shareText)}`;
      window.open(url, '_blank', 'width=600,height=400');
    };

  const handleSaveEdit = () => {
    const updatedIngredients = editIngredients.split('\n').map(i => i.trim()).filter(i => i !== '');
    const updatedInstructions = editInstructions.split('\n').map(i => i.trim()).filter(i => i !== '');
    
    if (updatedIngredients.length === 0 || updatedInstructions.length === 0) {
      alert("Ingredients and Instructions cannot be empty.");
      return;
    }

    const updatedRecipe: Recipe = {
      ...recipe,
      name: editName,
      description: editDescription,
      specialty: editSpecialty,
      calories: editCalories ? parseInt(editCalories, 10) : undefined,
      prepTime: editPrepTime || undefined,
      cookTime: editCookTime || undefined,
      ingredients: updatedIngredients,
      instructions: updatedInstructions,
    };
    if (onEditRecipe) {
      onEditRecipe(updatedRecipe);
    }
    setIsEditing(false);
  };

  if (isEditing) {
    return (
      <div className="glass-panel rounded-2xl shadow-2xl p-6 sm:p-8 animate-fade-in border-white/20">
        <div className="flex flex-col sm:flex-row justify-between items-start mb-6 gap-4">
          <h2 className="text-2xl font-bold text-gray-900 dark:text-white font-display">Edit Recipe</h2>
          <div className="flex items-center gap-2">
            <button onClick={handleSaveEdit} className="bg-blue-500 text-white px-4 py-2 rounded-lg font-semibold hover:bg-blue-600 transition-colors shadow">Save Changes</button>
            <button onClick={() => setIsEditing(false)} className="bg-white/40 dark:bg-gray-700/40 border border-white/20 dark:border-gray-600/30 text-gray-800 dark:text-gray-200 px-4 py-2 rounded-lg font-semibold hover:bg-white/60 dark:hover:bg-gray-700/60 transition-colors shadow-sm">Cancel</button>
          </div>
        </div>
        
        <div className="space-y-4">
          <div className="grid md:grid-cols-3 gap-4">
            <div className="md:col-span-2">
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Name</label>
              <input type="text" value={editName} onChange={e => setEditName(e.target.value)} className="w-full px-4 py-2 border border-white/30 dark:border-gray-600/30 rounded-lg bg-white/40 dark:bg-gray-800/40 text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500 backdrop-blur-sm" />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Calories (opt)</label>
              <input type="number" value={editCalories} onChange={e => setEditCalories(e.target.value)} placeholder="e.g., 400" className="w-full px-4 py-2 border border-white/30 dark:border-gray-600/30 rounded-lg bg-white/40 dark:bg-gray-800/40 text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500 backdrop-blur-sm" />
            </div>
          </div>
          <div className="grid md:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Prep Time (opt)</label>
              <input type="text" value={editPrepTime} onChange={e => setEditPrepTime(e.target.value)} placeholder="e.g., 15 mins" className="w-full px-4 py-2 border border-white/30 dark:border-gray-600/30 rounded-lg bg-white/40 dark:bg-gray-800/40 text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500 backdrop-blur-sm" />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Cook Time (opt)</label>
              <input type="text" value={editCookTime} onChange={e => setEditCookTime(e.target.value)} placeholder="e.g., 30 mins" className="w-full px-4 py-2 border border-white/30 dark:border-gray-600/30 rounded-lg bg-white/40 dark:bg-gray-800/40 text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500 backdrop-blur-sm" />
            </div>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Specialty</label>
            <input type="text" value={editSpecialty} onChange={e => setEditSpecialty(e.target.value)} className="w-full px-4 py-2 border border-white/30 dark:border-gray-600/30 rounded-lg bg-white/40 dark:bg-gray-800/40 text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500 backdrop-blur-sm" />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Description</label>
            <textarea value={editDescription} onChange={e => setEditDescription(e.target.value)} rows={3} className="w-full px-4 py-2 border border-white/30 dark:border-gray-600/30 rounded-lg bg-white/40 dark:bg-gray-800/40 text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500 backdrop-blur-sm" />
          </div>
          <div className="grid md:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Ingredients with quantities (one per line, e.g. '2 cups flour')</label>
              <textarea value={editIngredients} onChange={e => setEditIngredients(e.target.value)} rows={8} className="w-full px-4 py-2 border border-white/30 dark:border-gray-600/30 rounded-lg bg-white/40 dark:bg-gray-800/40 text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500 whitespace-pre-wrap backdrop-blur-sm" />
            </div>
            <div>
               <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Instructions (one per line)</label>
               <textarea value={editInstructions} onChange={e => setEditInstructions(e.target.value)} rows={8} className="w-full px-4 py-2 border border-white/30 dark:border-gray-600/30 rounded-lg bg-white/40 dark:bg-gray-800/40 text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500 whitespace-pre-wrap backdrop-blur-sm" />
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="glass-panel rounded-2xl shadow-2xl p-6 sm:p-8 animate-fade-in border-white/20">
      <div className="flex justify-between items-start mb-6">
        <div>
          <h2 className="text-3xl font-bold text-gray-900 dark:text-white">{recipe.name}</h2>
          <div className="flex flex-wrap items-center gap-3 mt-2">
            <p className="text-sm text-gray-500 dark:text-gray-400 italic mr-2">{recipe.specialty}</p>
            {recipe.calories && (
                <span className="text-xs font-semibold px-2 py-1 bg-orange-100 dark:bg-orange-900/50 text-orange-800 dark:text-orange-200 rounded-full border border-orange-200 dark:border-orange-800/50">
                  {recipe.calories} kcal
                </span>
            )}
            {recipe.difficulty && (
                <span className="text-xs font-semibold px-2 py-1 bg-purple-100 dark:bg-purple-900/50 text-purple-800 dark:text-purple-200 rounded-full border border-purple-200 dark:border-purple-800/50">
                  {recipe.difficulty}
                </span>
            )}
            {recipe.prepTime && (
                <span className="text-xs font-semibold px-2 py-1 bg-blue-100 dark:bg-blue-900/50 text-blue-800 dark:text-blue-200 rounded-full border border-blue-200 dark:border-blue-800/50">
                  Prep: {recipe.prepTime}
                </span>
            )}
            {recipe.cookTime && (
                <span className="flex items-center gap-1 text-xs font-semibold px-2 py-1 bg-red-100 dark:bg-red-900/50 text-red-800 dark:text-red-200 rounded-full border border-red-200 dark:border-red-800/50">
                  Cook: {recipe.cookTime}
                  {parseDurationList(recipe.cookTime) > 0 && (
                     <button
                        onClick={() => addTimer(`Cook: ${recipe.name}`, parseDurationList(recipe.cookTime))}
                        className="ml-1 p-0.5 rounded-full hover:bg-red-200 dark:hover:bg-red-800 focus:outline-none"
                        title="Start Cook Timer"
                     >
                       <Play className="w-3 h-3" />
                     </button>
                  )}
                </span>
            )}
          </div>
        </div>
        <div className="flex items-center gap-2">
            <button
              onClick={() => setIsEditing(true)}
              className="p-2 rounded-full hover:bg-gray-200 dark:hover:bg-gray-700 transition-colors relative"
              aria-label="Edit recipe"
            >
              <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6 text-gray-500 dark:text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                 <path strokeLinecap="round" strokeLinejoin="round" d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" />
              </svg>
            </button>
            <div className="flex items-center space-x-1 border-gray-200 dark:border-gray-700">
                <button
                    onClick={shareToFacebook}
                    className="p-2 rounded-full hover:bg-blue-50 dark:hover:bg-blue-900/30 text-blue-600 dark:text-blue-400 transition-colors"
                    aria-label="Share on Facebook"
                    title="Share on Facebook"
                >
                    <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="currentColor" stroke="none"><path d="M12 2C6.477 2 2 6.477 2 12c0 4.991 3.657 9.128 8.438 9.878v-6.987h-2.54V12h2.54V9.797c0-2.506 1.492-3.89 3.777-3.89 1.094 0 2.238.195 2.238.195v2.46h-1.26c-1.243 0-1.63.771-1.63 1.562V12h2.773l-.443 2.89h-2.33v6.988C18.343 21.128 22 16.991 22 12c0-5.523-4.477-10-10-10z"/></svg>
                </button>
                <button
                    onClick={shareToTwitter}
                    className="p-2 rounded-full hover:bg-sky-50 dark:hover:bg-sky-900/30 text-sky-500 dark:text-sky-400 transition-colors"
                    aria-label="Share on Twitter"
                    title="Share on Twitter"
                >
                    <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="currentColor" stroke="none"><path d="M22.46 6c-.77.35-1.6.58-2.46.69.88-.53 1.56-1.37 1.88-2.38-.83.5-1.75.85-2.72 1.05C18.37 4.5 17.26 4 16 4c-2.35 0-4.27 1.92-4.27 4.29 0 .34.04.67.11.98C8.28 9.09 5.11 7.38 3 4.79c-.37.63-.58 1.37-.58 2.15 0 1.49.75 2.81 1.91 3.56-.71 0-1.37-.2-1.95-.5v.05c0 2.08 1.48 3.82 3.44 4.21a4.22 4.22 0 0 1-1.93.07 4.28 4.28 0 0 0 4 2.98 8.521 8.521 0 0 1-5.33 1.84c-.34 0-.68-.02-1.02-.06C3.44 20.29 5.7 21 8.12 21 16 21 20.33 14.46 20.33 8.79c0-.19 0-.37-.01-.56.84-.6 1.56-1.36 2.14-2.23z"/></svg>
                </button>
                <button
                    onClick={shareToPinterest}
                    className="p-2 rounded-full hover:bg-red-50 dark:hover:bg-red-900/30 text-red-600 dark:text-red-400 transition-colors"
                    aria-label="Share on Pinterest"
                    title="Share on Pinterest"
                >
                    <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="currentColor" stroke="none"><path d="M12 2C6.48 2 2 6.48 2 12c0 4.24 2.63 7.85 6.35 9.31-.09-.79-.17-2.01.03-2.88.19-.82 1.22-5.18 1.22-5.18s-.31-.63-.31-1.55c0-1.46.85-2.55 1.91-2.55.89 0 1.32.67 1.32 1.47 0 .9-.57 2.24-.87 3.49-.25 1.04.52 1.89 1.54 1.89 1.84 0 3.27-1.95 3.27-4.75 0-2.47-1.78-4.19-4.32-4.19-2.95 0-4.68 2.21-4.68 4.5 0 .89.34 1.85.77 2.37.08.1.1.22.07.31l-.25 1.05c-.04.16-.14.2-.31.12-1.16-.54-1.89-2.22-1.89-3.58 0-2.91 2.12-5.59 6.1-5.59 3.2 0 5.69 2.28 5.69 5.33 0 3.18-2 5.75-4.78 5.75-1.11 0-2.15-.58-2.51-1.26l-.68 2.61c-.25.96-.92 2.15-1.38 2.89A9.97 9.97 0 0 0 12 22c5.52 0 10-4.48 10-10S17.52 2 12 2z"/></svg>
                </button>
            </div>
            <button
                onClick={navShare}
                className="p-2 rounded-full hover:bg-gray-200 dark:hover:bg-gray-700 transition-colors relative"
                aria-label="Share/Copy"
                title="Share via standard dialog"
            >
                <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6 text-gray-500 dark:text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M8.684 13.342C8.886 12.938 9 12.482 9 12s-.114-.938-.316-1.342m0 2.684a3 3 0 110-2.684m0 2.684l6.632 3.316m-6.632-6l6.632-3.316m0 0a3 3 0 105.367-2.684 3 3 0 00-5.367 2.684zm0 9.316a3 3 0 105.367 2.684 3 3 0 00-5.367-2.684z" />
                </svg>
                {shareStatus === 'copied' && (
                    <span className="absolute -top-10 left-1/2 transform -translate-x-1/2 bg-gray-800 text-white text-xs rounded-md px-2 py-1 shadow transition-opacity animate-fade-in whitespace-nowrap z-10">
                    Copied!
                    </span>
                )}
            </button>
            <button
              onClick={() => onSave(recipe)}
              disabled={isFavorite}
              className="p-2 rounded-full hover:bg-gray-200 dark:hover:bg-gray-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
              aria-label={isFavorite ? 'Saved to favorites' : 'Save to favorites'}
            >
              <svg xmlns="http://www.w3.org/2000/svg" className={`h-6 w-6 ${isFavorite ? 'text-yellow-400' : 'text-gray-400'}`} fill={isFavorite ? 'currentColor' : 'none'} viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11.049 2.927c.3-.921 1.603-.921 1.902 0l1.519 4.674a1 1 0 00.95.69h4.915c.969 0 1.371 1.24.588 1.81l-3.976 2.888a1 1 0 00-.363 1.118l1.518 4.674c.3.922-.755 1.688-1.538 1.118l-3.976-2.888a1 1 0 00-1.175 0l-3.976 2.888c-.783.57-1.838-.196-1.538-1.118l1.518-4.674a1 1 0 00-.363-1.118l-3.976-2.888c-.783-.57-.38-1.81.588-1.81h4.914a1 1 0 00.951-.69l1.519-4.674z" />
              </svg>
            </button>
        </div>
      </div>

      {onAddToMealPlan && (
        <div className="mb-6 flex items-center bg-gray-50/50 dark:bg-gray-800/40 p-3 rounded-xl border border-gray-200/50 dark:border-gray-700/50">
          <span className="mr-3 font-semibold text-sm text-gray-700 dark:text-gray-300">Meal Plan:</span>
          <select 
            value={selectedDay}
            onChange={(e) => setSelectedDay(e.target.value as DayOfWeek)}
            className="bg-white dark:bg-gray-700 border border-gray-300 dark:border-gray-600 rounded-lg px-3 py-1.5 text-sm mr-2 focus:ring-2 focus:ring-blue-500 outline-none"
          >
            <option value="" disabled>Select day...</option>
            {DAYS.map(d => <option key={d} value={d}>{d}</option>)}
          </select>
          <button 
            onClick={handleAddToMealPlan}
            disabled={!selectedDay}
            className="bg-blue-500 hover:bg-blue-600 disabled:bg-blue-300 text-white px-3 py-1.5 rounded-lg text-sm font-semibold transition-colors relative"
          >
            Add
            {addStatus && (
                <span className="absolute -top-8 left-1/2 -translate-x-1/2 bg-gray-700 text-white text-xs rounded-md px-2 py-1 transition-opacity animate-fade-in whitespace-nowrap">
                  Added!
                </span>
            )}
          </button>
        </div>
      )}

      <p className="text-gray-600 dark:text-gray-300 mb-6">{recipe.description}</p>
      
      <div className="grid md:grid-cols-12 gap-8">
        <div className="md:col-span-5">
          <div className="flex justify-between items-center mb-3 border-b pb-2">
            <h3 className="text-xl font-semibold text-gray-800 dark:text-gray-200">Ingredients</h3>
            {onScale && (
              <div className="flex gap-2">
                <button
                  onClick={() => onScale('half')}
                  disabled={isLoading}
                  className="px-2 py-1 text-xs bg-gray-200 dark:bg-gray-700 hover:bg-gray-300 dark:hover:bg-gray-600 text-gray-700 dark:text-gray-300 rounded disabled:opacity-50 transition-colors"
                  title="Make Half Recipe"
                >
                  ½x
                </button>
                <button
                  onClick={() => onScale('double')}
                  disabled={isLoading}
                  className="px-2 py-1 text-xs bg-gray-200 dark:bg-gray-700 hover:bg-gray-300 dark:hover:bg-gray-600 text-gray-700 dark:text-gray-300 rounded disabled:opacity-50 transition-colors"
                  title="Make Double Recipe"
                >
                  2x
                </button>
              </div>
            )}
          </div>
          <ul className="space-y-2 text-gray-600 dark:text-gray-300">
            {recipe.ingredients.map((ingredient, index) => (
              <li key={index} className="flex items-start gap-2 group">
                 <span className="mt-2 w-1.5 h-1.5 rounded-full bg-gray-400 dark:bg-gray-500 shrink-0"></span>
                 <span className="flex-grow">{ingredient}</span>
                 <button
                   onClick={() => setMissingIngredients(prev => prev ? `${prev}, ${ingredient}` : ingredient)}
                   className="text-xs px-2 py-1 bg-gray-100 hover:bg-gray-200 dark:bg-gray-800 dark:hover:bg-gray-700 text-gray-600 dark:text-gray-400 rounded opacity-0 group-hover:opacity-100 transition-opacity flex-shrink-0"
                   title="Add to missing ingredients"
                 >
                   + Missing
                 </button>
              </li>
            ))}
          </ul>
        </div>
        <div className="md:col-span-7">
          <h3 className="text-xl font-semibold mb-3 text-gray-800 dark:text-gray-200 border-b pb-2">Instructions</h3>
          <ol className="space-y-4 list-decimal list-inside text-gray-600 dark:text-gray-300">
            {recipe.instructions.map((step, index) => (
              <li key={index} className="pl-2 leading-relaxed">
                {renderInstructionWithTimers(step)}
              </li>
            ))}
          </ol>
        </div>
      </div>

      <div className="mt-8 pt-6 border-t border-gray-200 dark:border-gray-700 space-y-4">
        <div>
           <h3 className="text-lg font-semibold text-gray-800 dark:text-gray-200">Modify Recipe</h3>
           <p className="text-sm text-gray-500 dark:text-gray-400 mb-3">AI can suggest an alternative if you don't have certain ingredients, or want fewer calories.</p>
           <form onSubmit={handleModifySubmit} className="flex flex-col sm:flex-row gap-2">
             <input
               type="text"
               value={missingIngredients}
               onChange={(e) => setMissingIngredients(e.target.value)}
               placeholder="Missing ingredients? e.g., tomatoes"
               className="flex-grow px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-gray-50 dark:bg-gray-700 focus:outline-none focus:ring-2 focus:ring-blue-500 transition-shadow"
               disabled={isLoading}
             />
             <button
               type="submit"
               className="bg-green-600 text-white font-bold py-2 px-4 rounded-lg hover:bg-green-700 disabled:bg-green-300 dark:disabled:bg-green-800 disabled:cursor-not-allowed transition-colors whitespace-nowrap"
               disabled={isLoading || !missingIngredients.trim()}
             >
               Get Alternative
             </button>
           </form>
        </div>
        <div className="flex gap-2 text-sm">
           <button
             onClick={() => onModify('', true)}
             disabled={isLoading}
             className="bg-orange-500 text-white font-bold py-2 px-4 rounded-lg hover:bg-orange-600 disabled:bg-orange-300 dark:disabled:bg-orange-800 disabled:cursor-not-allowed transition-colors whitespace-nowrap shadow-sm"
           >
             {isLoading ? 'Adapting...' : 'Make it Lower Calorie'}
           </button>
        </div>
      </div>
    </div>
  );
};
// --- FavoritesList.tsx ---
interface FavoritesListProps {
  favorites: Recipe[];
  onRemove: (recipeName: string) => void;
}

const FavoritesList: React.FC<FavoritesListProps> = ({ favorites, onRemove }) => {
  if (favorites.length === 0) {
    return (
      <div className="text-center p-8 glass-panel rounded-2xl shadow-xl border-white/20">
        <h2 className="text-2xl font-bold text-gray-800 dark:text-white font-display">No Favorites Yet</h2>
        <p className="mt-4 text-gray-600 dark:text-gray-300">
          You haven't saved any recipes. Find a recipe you like and click the star to save it!
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {favorites.map((recipe) => (
        <div key={recipe.name} className="glass-panel rounded-2xl shadow-lg p-6 relative animate-fade-in border-white/10">
           <button
            onClick={() => onRemove(recipe.name)}
            className="absolute top-4 right-4 p-2 rounded-full text-gray-400 hover:bg-gray-200 dark:hover:bg-gray-700 hover:text-red-500 dark:hover:text-red-400 transition-colors"
            aria-label={`Remove ${recipe.name} from favorites`}
          >
            <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
            </svg>
          </button>
          <h3 className="text-2xl font-bold text-gray-900 dark:text-white mb-2">{recipe.name}</h3>
          <p className="text-gray-600 dark:text-gray-300 italic">{recipe.description}</p>
        </div>
      ))}
    </div>
  );
};
// --- MealPlanner.tsx ---
interface MealPlannerProps {
  mealPlan: MealPlan;
  onRemoveFromPlan: (day: DayOfWeek, index: number) => void;
  onGenerateShoppingList: () => void;
}



const MealPlanner: React.FC<MealPlannerProps> = ({ mealPlan, onRemoveFromPlan, onGenerateShoppingList }) => {
  const [nameFilter, setNameFilter] = useState('');
  const [ingredientFilter, setIngredientFilter] = useState('');
  const [minCalories, setMinCalories] = useState<number | ''>('');
  const [maxCalories, setMaxCalories] = useState<number | ''>('');
  const [showFilters, setShowFilters] = useState(false);

  const [calorieGoal, setCalorieGoal] = useState<number>(2000);

  useEffect(() => {
    setCalorieGoal(getCalorieGoal());
  }, []);

  const handleGoalChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const newGoal = parseInt(e.target.value, 10) || 0;
    setCalorieGoal(newGoal);
    saveCalorieGoal(newGoal);
  };

  const getFilteredMeals = (day: DayOfWeek) => {
    if (!mealPlan[day]) return [];
    
    return mealPlan[day]
      .map((recipe, originalIndex) => ({ recipe, originalIndex }))
      .filter(({ recipe }) => {
        const matchName = !nameFilter.trim() || recipe.name.toLowerCase().includes(nameFilter.toLowerCase());
        const matchIngredient = !ingredientFilter.trim() || recipe.ingredients.some(i => i.toLowerCase().includes(ingredientFilter.toLowerCase()));
        
        const cal = parseInt(String(recipe.calories), 10);
        const recipeCals = isNaN(cal) ? 0 : cal;
        const matchMinCal = minCalories === '' || recipeCals >= minCalories;
        const matchMaxCal = maxCalories === '' || recipeCals <= maxCalories;

        return matchName && matchIngredient && matchMinCal && matchMaxCal;
      });
  };

  const getDailyCalories = (day: DayOfWeek): number => {
    if (!mealPlan[day]) return 0;
    return mealPlan[day].reduce((total, recipe) => {
      const cal = parseInt(String(recipe.calories), 10);
      return total + (isNaN(cal) ? 0 : cal);
    }, 0);
  };

  return (
    <div className="space-y-8 animate-fade-in">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div className="flex flex-col">
          <h2 className="text-2xl font-bold font-display text-gray-800 dark:text-white">Weekly Meal Plan</h2>
          <div className="flex items-center gap-2 mt-2">
            <label className="text-sm text-gray-600 dark:text-gray-300">Daily Calorie Goal:</label>
            <input
              type="number"
              value={calorieGoal}
              onChange={handleGoalChange}
              className="w-24 px-2 py-1 text-sm border border-gray-300 dark:border-gray-600 rounded bg-white/40 dark:bg-gray-800/40 text-gray-800 dark:text-gray-200 focus:outline-none focus:ring-1 focus:ring-blue-500"
            />
          </div>
        </div>
        <div className="flex flex-col sm:flex-row gap-3 w-full sm:w-auto">
          <button
            onClick={() => setShowFilters(!showFilters)}
            className="px-4 py-2 bg-blue-500 hover:bg-blue-600 text-white font-semibold rounded-lg shadow transition-colors whitespace-nowrap"
          >
            {showFilters ? 'Hide Filters' : 'Filter Meals'}
          </button>
          <button
            onClick={onGenerateShoppingList}
            className="px-4 py-2 bg-green-500 hover:bg-green-600 text-white font-semibold rounded-lg shadow transition-colors whitespace-nowrap"
          >
            Generate Shopping List
          </button>
        </div>
      </div>

      {showFilters && (
        <div className="glass-panel p-4 rounded-xl border border-white/20 grid grid-cols-1 md:grid-cols-4 gap-4 animate-fade-in">
          <div>
            <label className="block text-xs text-gray-500 dark:text-gray-400 mb-1">Recipe Name</label>
            <input
              type="text"
              placeholder="e.g. Pasta"
              value={nameFilter}
              onChange={(e) => setNameFilter(e.target.value)}
              className="w-full px-3 py-2 text-sm border border-white/30 bg-white/40 dark:bg-gray-800/40 dark:border-gray-600/30 rounded-lg text-gray-800 dark:text-gray-200 focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>
          <div>
            <label className="block text-xs text-gray-500 dark:text-gray-400 mb-1">Ingredient</label>
            <input
              type="text"
              placeholder="e.g. Chicken"
              value={ingredientFilter}
              onChange={(e) => setIngredientFilter(e.target.value)}
              className="w-full px-3 py-2 text-sm border border-white/30 bg-white/40 dark:bg-gray-800/40 dark:border-gray-600/30 rounded-lg text-gray-800 dark:text-gray-200 focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>
          <div>
            <label className="block text-xs text-gray-500 dark:text-gray-400 mb-1">Min Calories</label>
            <input
              type="number"
              placeholder="0"
              value={minCalories}
              onChange={(e) => setMinCalories(e.target.value ? parseInt(e.target.value, 10) : '')}
              className="w-full px-3 py-2 text-sm border border-white/30 bg-white/40 dark:bg-gray-800/40 dark:border-gray-600/30 rounded-lg text-gray-800 dark:text-gray-200 focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>
          <div>
            <label className="block text-xs text-gray-500 dark:text-gray-400 mb-1">Max Calories</label>
            <input
              type="number"
              placeholder="1000"
              value={maxCalories}
              onChange={(e) => setMaxCalories(e.target.value ? parseInt(e.target.value, 10) : '')}
              className="w-full px-3 py-2 text-sm border border-white/30 bg-white/40 dark:bg-gray-800/40 dark:border-gray-600/30 rounded-lg text-gray-800 dark:text-gray-200 focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>
        </div>
      )}

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
        {DAYS.map(day => {
          const filteredMeals = getFilteredMeals(day);
          const dailyCalories = getDailyCalories(day);
          const calPercent = Math.min(100, Math.round((dailyCalories / calorieGoal) * 100)) || 0;
          const isOverGoal = dailyCalories > calorieGoal;

          return (
          <div key={day} className="glass-panel p-4 rounded-xl border border-white/20">
            <h3 className="font-bold text-lg border-b border-gray-200/30 dark:border-gray-700/30 pb-2 mb-2">{day}</h3>
            
            <div className="mb-4">
              <div className="flex justify-between items-center text-xs mb-1">
                <span className="text-gray-600 dark:text-gray-400">Calories: {dailyCalories} / {calorieGoal}</span>
                <span className={`font-semibold ${isOverGoal ? 'text-red-500' : 'text-blue-500'}`}>{calPercent}%</span>
              </div>
              <div className="w-full bg-gray-200 dark:bg-gray-700 rounded-full h-1.5 mb-1 overflow-hidden">
                <div 
                  className={`h-1.5 rounded-full ${isOverGoal ? 'bg-red-500' : 'bg-blue-500'}`} 
                  style={{ width: `${calPercent}%` }}
                ></div>
              </div>
            </div>

            {filteredMeals.length > 0 ? (
              <ul className="space-y-3">
                {filteredMeals.map(({ recipe, originalIndex }) => (
                  <li key={`${recipe.name}-${originalIndex}`} className="flex justify-between items-center bg-white/40 dark:bg-gray-800/40 p-2 rounded-lg">
                    <span className="text-sm font-medium truncate flex-1 block" title={recipe.name}>{recipe.name}</span>
                    <button
                      onClick={() => onRemoveFromPlan(day, originalIndex)}
                      className="ml-2 text-red-500 hover:text-red-700 p-1"
                      title="Remove"
                    >
                      <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                      </svg>
                    </button>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-sm text-gray-400 italic">
                {mealPlan[day]?.length > 0 ? 'No matching meals.' : 'No meals planned.'}
              </p>
            )}
          </div>
        )})}
      </div>
    </div>
  );
};
// --- ShoppingList.tsx ---
interface ShoppingListProps {
  mealPlan: MealPlan;
}

const ShoppingList: React.FC<ShoppingListProps> = ({ mealPlan }) => {
  // Aggregate all ingredients from the meal plan
  const allIngredients = Object.values(mealPlan).flat().reduce((acc: string[], recipe) => {
    return acc.concat(recipe.ingredients);
  }, []);

  // Remove exact duplicates for a cleaner list (a simple deduplication strategy)
  // In a real app, this would need complex parsing (NLP) to combine "1 cup flour" and "2 cups flour"
  const uniqueIngredients = Array.from(new Set(allIngredients)).sort();

  return (
    <div className="glass-panel rounded-2xl shadow-xl p-6 sm:p-8 animate-fade-in border-white/20 mt-8">
      <h2 className="text-3xl font-bold font-display text-gray-800 dark:text-white mb-6">Shopping List</h2>
      
      {uniqueIngredients.length > 0 ? (
        <ul className="grid grid-cols-1 md:grid-cols-2 gap-3">
          {uniqueIngredients.map((ingredient, index) => (
            <li key={index} className="flex items-start">
              <span className="flex-shrink-0 h-5 w-5 text-green-500 mr-2 mt-0.5">
                <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor">
                  <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
                </svg>
              </span>
              <span className="text-gray-700 dark:text-gray-200">{ingredient}</span>
            </li>
          ))}
        </ul>
      ) : (
        <p className="text-gray-500 italic">Add some meals to your plan to generate a shopping list.</p>
      )}
    </div>
  );
};

// --- Timers --
interface TimerInfo {
  id: string;
  label: string;
  durationMs: number;
  endTimeMs: number;
  remainingMs: number;
  isPaused: boolean;
}

let activeTimers: TimerInfo[] = [];
let timerListeners: (() => void)[] = [];

const subscribeToTimers = (listener: () => void) => {
  timerListeners.push(listener);
  return () => {
    timerListeners = timerListeners.filter(l => l !== listener);
  };
};

const triggerTimerUpdate = () => {
  timerListeners.forEach(l => l());
};

const addTimer = (label: string, seconds: number) => {
  activeTimers = [
    ...activeTimers,
    {
      id: Math.random().toString(36).slice(2, 9),
      label,
      durationMs: seconds * 1000,
      endTimeMs: Date.now() + seconds * 1000,
      remainingMs: seconds * 1000,
      isPaused: false
    }
  ];
  triggerTimerUpdate();
};

const togglePauseTimer = (id: string) => {
  activeTimers = activeTimers.map(t => {
    if (t.id === id) {
      if (t.isPaused) {
        return { ...t, isPaused: false, endTimeMs: Date.now() + t.remainingMs };
      } else {
        return { ...t, isPaused: true, remainingMs: Math.max(0, t.endTimeMs - Date.now()) };
      }
    }
    return t;
  });
  triggerTimerUpdate();
};

const removeTimer = (id: string) => {
  activeTimers = activeTimers.filter(t => t.id !== id);
  triggerTimerUpdate();
};

const formatTime = (ms: number) => {
  const totalSeconds = Math.max(0, Math.floor(ms / 1000));
  const h = Math.floor(totalSeconds / 3600);
  const m = Math.floor((totalSeconds % 3600) / 60);
  const s = totalSeconds % 60;
  if (h > 0) return `${h}:${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
  return `${m}:${s.toString().padStart(2, '0')}`;
};

const parseDurationList = (text: string): number => {
  let totalSeconds = 0;
  let match;
  const regex = /(\d+)\s*(mins?|minutes?|hrs?|hours?|secs?|seconds?|min?)\b/gi;
  while ((match = regex.exec(text)) !== null) {
    const amount = parseInt(match[1], 10);
    const unit = match[2].toLowerCase();
    if (unit.startsWith('hr') || unit.startsWith('hour')) totalSeconds += amount * 3600;
    else if (unit.startsWith('min')) totalSeconds += amount * 60;
    else totalSeconds += amount;
  }
  return totalSeconds;
};

const useTimers = () => {
  const [timers, setTimers] = useState<TimerInfo[]>(activeTimers);
  
  useEffect(() => {
    const unsub = subscribeToTimers(() => setTimers([...activeTimers]));
    
    const interval = setInterval(() => {
      let needsUpdate = false;
      activeTimers = activeTimers.map(t => {
        if (!t.isPaused && t.remainingMs > 0) {
          needsUpdate = true;
          const newRemaining = Math.max(0, t.endTimeMs - Date.now());
          return { ...t, remainingMs: newRemaining };
        }
        return t;
      });
      if (needsUpdate) triggerTimerUpdate();
    }, 1000);
    
    return () => {
      unsub();
      clearInterval(interval);
    };
  }, []);
  
  return timers;
};

const TimerOverlay: React.FC = () => {
  const timers = useTimers();
  if (timers.length === 0) return null;
  
  return (
    <div className="fixed bottom-4 right-4 z-50 flex flex-col gap-2">
      {timers.map(timer => (
        <div key={timer.id} className={`bg-white dark:bg-gray-800 rounded-lg shadow-lg border p-3 min-w-[200px] ${timer.remainingMs === 0 ? 'border-red-500 animate-pulse' : 'border-gray-200 dark:border-gray-700'}`}>
          <div className="flex justify-between items-center mb-1">
            <span className="text-xs font-semibold text-gray-500 dark:text-gray-400 truncate max-w-[120px]" title={timer.label}>{timer.label}</span>
            <button onClick={() => removeTimer(timer.id)} className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-300">
              <X className="w-3 h-3" />
            </button>
          </div>
          <div className="flex justify-between items-center">
            <div className={`text-xl font-mono font-bold ${timer.remainingMs === 0 ? 'text-red-500' : 'text-gray-800 dark:text-gray-100'}`}>
              {formatTime(timer.remainingMs)}
            </div>
            {timer.remainingMs > 0 && (
              <div className="flex gap-1">
                <button 
                  onClick={() => togglePauseTimer(timer.id)}
                  className="p-1.5 rounded-full bg-gray-100 dark:bg-gray-700 hover:bg-gray-200 dark:hover:bg-gray-600 text-gray-700 dark:text-gray-200"
                >
                  {timer.isPaused ? <Play className="w-4 h-4" /> : <Pause className="w-4 h-4" />}
                </button>
              </div>
            )}
            {timer.remainingMs === 0 && (
               <div className="flex gap-1">
                 <Bell className="w-5 h-5 text-red-500" />
               </div>
            )}
          </div>
        </div>
      ))}
    </div>
  );
};

// --- App.tsx ---
const App: React.FC = () => {
  const [recipe, setRecipe] = useState<Recipe | null>(null);
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);
  const [originalQuery, setOriginalQuery] = useState<{ type: 'text' | 'image'; value: string } | null>(null);
  const [favorites, setFavorites] = useState<Recipe[]>([]);
  const [mealPlan, setMealPlanState] = useState<MealPlan>(getMealPlan());
  const [showShoppingList, setShowShoppingList] = useState(false);
  const [language, setLanguageState] = useState<string>(getLanguage());

  const [availableLanguages, setAvailableLanguages] = useState<string[]>([
    'English', 'Spanish', 'French', 'German', 'Italian', 'Portuguese', 'Japanese', 'Korean', 'Chinese', 'Hindi', 'Russian'
  ]);

  useEffect(() => {
    const fetchLanguages = async () => {
      try {
        const response = await fetch('https://restcountries.com/v3.1/all');
        const data = await response.json();
        const langSet = new Set<string>();
        if (Array.isArray(data)) {
          data.forEach((country: any) => {
            if (country.languages) {
              Object.values(country.languages).forEach((lang: unknown) => {
                if (typeof lang === 'string') {
                  langSet.add(lang);
                }
              });
            }
          });
        } else {
          console.error("API response is not an array:", data);
        }
        const langArray = Array.from(langSet).sort();
        if (langArray.length > 0) {
          if (!langArray.includes(getLanguage())) {
             langArray.push(getLanguage());
          }
          setAvailableLanguages(langArray);
        }
      } catch (error) {
        console.error('Error fetching languages:', error);
      }
    };
    fetchLanguages();
  }, []);

  const handleLanguageChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const newLanguage = e.target.value;
    setLanguageState(newLanguage);
    saveLanguage(newLanguage);
  };

  useEffect(() => {
    setFavorites(getFavorites());
  }, []);

  useEffect(() => {
    saveFavorites(favorites);
  }, [favorites]);

  useEffect(() => {
    saveMealPlan(mealPlan);
  }, [mealPlan]);

  const handleSaveFavorite = (recipeToSave: Recipe) => {
    if (!favorites.some(fav => fav.name === recipeToSave.name)) {
      setFavorites(prevFavorites => [...prevFavorites, recipeToSave]);
    }
  };

  const handleRemoveFavorite = (recipeNameToRemove: string) => {
    setFavorites(prevFavorites => prevFavorites.filter(fav => fav.name !== recipeNameToRemove));
  };

  const handleAddToMealPlan = (recipeToAdd: Recipe, day: DayOfWeek) => {
    setMealPlanState(prev => ({
      ...prev,
      [day]: [...(prev[day] || []), recipeToAdd]
    }));
  };

  const handleRemoveFromMealPlan = (day: DayOfWeek, index: number) => {
    setMealPlanState(prev => {
      const newPlanForDay = [...(prev[day] || [])];
      newPlanForDay.splice(index, 1);
      return {
        ...prev,
        [day]: newPlanForDay
      };
    });
  };

  const handleEditRecipe = (updatedRecipe: Recipe) => {
    setRecipe(updatedRecipe);
    // If it's a favorite, update the favorite list too
    setFavorites(prevFavorites => prevFavorites.map(fav => fav.name === recipe?.name ? updatedRecipe : fav));
    // Since names might change, we match against the previous active recipe's name which we can infer from the `recipe` state (or just the original name).
    // Actually, `recipe` currently holds the BEFORE edit state.
  };

  const handleApiError = (err: unknown) => {
    console.error(err);
    let errorMessage = 'An unexpected error occurred. Please try again later.';
    if (err instanceof Error) {
        switch (err.message) {
            case 'INVALID_API_KEY':
                errorMessage = 'Your API Key is invalid or missing. Please ensure it is configured correctly.';
                break;
            case 'RATE_LIMIT_EXCEEDED':
                errorMessage = 'Too many requests were sent in a short period. Please wait a moment before trying again.';
                break;
            case 'PARSING_ERROR':
                errorMessage = 'The AI returned an unexpected response format. Please try your request again.';
                break;
            case 'GEMINI_API_ERROR':
                errorMessage = 'There was a problem communicating with the AI service. Please try again later.';
                break;
        }
    }
    setError(errorMessage);
  }

  const handleGetRecipe = async (type: 'text' | 'image', value: string | File, isStrictMode: boolean = false, difficulty?: string) => {
    setIsLoading(true);
    setError(null);
    setRecipe(null);

    try {
      let newRecipe: Recipe | null = null;
      if (type === 'text' && typeof value === 'string') {
        setOriginalQuery({ type: 'text', value });
        newRecipe = await generateRecipe(value, isStrictMode, language, difficulty);
      } else if (type === 'image' && value instanceof File) {
        newRecipe = await identifyAndGenerateRecipe(value, language, difficulty);
        if(newRecipe) {
           if (newRecipe.name === "Error") {
             throw new Error(newRecipe.description || "The provided image does not appear to contain food or cooking ingredients.");
           }
           setOriginalQuery({ type: 'text', value: newRecipe.name });
        }
      }
      
      if (newRecipe) {
        setRecipe(newRecipe);
      } else {
        setError('Could not generate a recipe. Please try again.');
      }
    } catch (err) {
      handleApiError(err);
    } finally {
      setIsLoading(false);
    }
  };

  const handleModifyRecipe = async (missingIngredients: string, lowerCalories: boolean = false) => {
    if (!originalQuery) {
      setError('Cannot modify recipe without an original query.');
      return;
    }

    setIsLoading(true);
    setError(null);
    
    try {
      const newRecipe = await modifyRecipe(originalQuery.value, missingIngredients, lowerCalories, language);
      setRecipe(newRecipe);
    } catch (err) {
      handleApiError(err);
    } finally {
      setIsLoading(false);
    }
  };

  const handleScaleRecipe = async (scaleFactor: string) => {
    if (!recipe) return;
    
    setIsLoading(true);
    setError(null);
    
    try {
      const scaledRecipe = await scaleRecipe(recipe, scaleFactor, language);
      
      // Merge properties missing from scaled recipe
      const mergedRecipe = { ...scaledRecipe };
      if (!mergedRecipe.calories && recipe.calories) {
        // Just a fallback in case AI gives up scaling calories
        mergedRecipe.calories = recipe.calories; 
      }
      setRecipe(mergedRecipe);
    } catch (err) {
      handleApiError(err);
    } finally {
      setIsLoading(false);
    }
  };

  const navLinkClasses = ({ isActive }: { isActive: boolean }): string => {
    const baseClasses = "py-2 px-6 font-semibold rounded-full transition-all duration-300";
    const activeClasses = "bg-blue-500 text-white shadow-lg transform scale-105";
    const inactiveClasses = "bg-white/30 dark:bg-gray-800/30 hover:bg-white/50 dark:hover:bg-gray-700/50 backdrop-blur-sm";
    return `${baseClasses} ${isActive ? activeClasses : inactiveClasses}`;
  };

  return (
    <HashRouter future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
      <TimerOverlay />
      <div className="min-h-screen bg-transparent text-gray-900 dark:text-gray-100 font-sans p-4 sm:p-6 lg:p-8">
        <div className="max-w-4xl mx-auto glass-panel p-6 sm:p-8 rounded-3xl">
          <Header />
          <nav className="flex flex-wrap justify-center items-center gap-2 sm:gap-4 mb-8">
            <NavLink to="/" className={navLinkClasses}>
              Search Recipes
            </NavLink>
            <NavLink to="/favorites" className={navLinkClasses}>
              My Favorites ({favorites.length})
            </NavLink>
            <NavLink to="/meal-plan" className={navLinkClasses}>
              Meal Plan
            </NavLink>
            <div className="ml-0 sm:ml-auto">
              <select
                value={language}
                onChange={handleLanguageChange}
                className="bg-white/40 dark:bg-gray-800/40 border border-white/30 dark:border-gray-600/30 text-gray-800 dark:text-gray-200 py-1.5 px-3 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500 shadow-sm backdrop-blur-sm cursor-pointer"
                title="Select preferred language"
              >
                {availableLanguages.map(lang => (
                  <option key={lang} value={lang}>{lang}</option>
                ))}
              </select>
            </div>
          </nav>
          <main>
            <Routes>
              <Route path="/" element={
                <>
                  <RecipeInput onGetRecipe={handleGetRecipe} disabled={isLoading} />
                  <div className="mt-8">
                    {isLoading && <Spinner />}
                    {error && <ErrorDisplay message={error} />}
                    {!isLoading && !error && !recipe && <Welcome />}
                    {!isLoading && !error && recipe && (
                      <RecipeDisplay
                        recipe={recipe}
                        onModify={handleModifyRecipe}
                        onScale={handleScaleRecipe}
                        isLoading={isLoading}
                        onSave={handleSaveFavorite}
                        isFavorite={favorites.some(fav => fav.name === recipe.name)}
                        onAddToMealPlan={handleAddToMealPlan}
                        onEditRecipe={handleEditRecipe}
                      />
                    )}
                  </div>
                </>
              } />
              <Route path="/favorites" element={
                <FavoritesList favorites={favorites} onRemove={handleRemoveFavorite} />
              } />
              <Route path="/meal-plan" element={
                <>
                  <MealPlanner 
                    mealPlan={mealPlan} 
                    onRemoveFromPlan={handleRemoveFromMealPlan}
                    onGenerateShoppingList={() => setShowShoppingList(!showShoppingList)}
                  />
                  {showShoppingList && <ShoppingList mealPlan={mealPlan} />}
                </>
              } />
            </Routes>
          </main>
        </div>
      </div>
    </HashRouter>
  );
};



const rootElement = document.getElementById('root');
if (!rootElement) throw new Error('Could not find root element');
import ReactDOM from 'react-dom/client';
ReactDOM.createRoot(rootElement).render(<React.StrictMode><App /></React.StrictMode>);
